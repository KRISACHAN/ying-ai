/* global console, process */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LocalToolRegistry, createCompanionCore, createModel } from "@ying-ai/ai-core";
import { createWebSearchTool } from "@ying-ai/tool-web-search";
import { TavilyWebSearchProvider } from "@ying-ai/tool-web-search-tavily";

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return index === -1 ? [line, ""] : [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readRequired(env, key) {
  const value = env[key]?.trim();

  if (!value) {
    console.error(`请配置 apps/model-runtime-demo/.env: ${key}`);
    process.exit(1);
  }

  return value;
}

function readBool(env, key) {
  const value = env[key]?.trim();
  return value === "true" ? true : value === "false" ? false : undefined;
}

const envPath = resolve(process.cwd(), ".env");
const env = { ...loadEnvFile(envPath), ...process.env };

readRequired(env, "TAVILY_API_KEY");
readRequired(env, "OPENAI_API_KEY");
readRequired(env, "OPENAI_MODEL");

if (env.WEB_SEARCH_ENABLED?.trim() !== "true") {
  console.error("请配置 apps/model-runtime-demo/.env: WEB_SEARCH_ENABLED=true");
  process.exit(1);
}
if (env.OPENAI_MODEL_SUPPORTS_TOOL_CALLING?.trim() !== "true") {
  console.error("请配置 apps/model-runtime-demo/.env: OPENAI_MODEL_SUPPORTS_TOOL_CALLING=true");
  process.exit(1);
}

const model = createModel({
  apiKey: env.OPENAI_API_KEY,
  model: env.OPENAI_MODEL,
  ...(env.OPENAI_BASE_URL?.trim() ? { baseUrl: env.OPENAI_BASE_URL.trim() } : {}),
  primaryProfileOverride: {
    capabilities: {
      streaming: readBool(env, "OPENAI_MODEL_SUPPORTS_STREAMING") ?? true,
      toolCalling: true,
      usage: readBool(env, "OPENAI_MODEL_SUPPORTS_USAGE") ?? false,
    },
  },
  retry: {
    primaryMaxRetries: Number.parseInt(env.OPENAI_PRIMARY_MAX_RETRIES ?? "0", 10) || 0,
    fallbackMaxRetries: Number.parseInt(env.OPENAI_FALLBACK_MAX_RETRIES ?? "0", 10) || 0,
  },
});

function createTools({ enabled = true, toolCalling = true } = {}) {
  const tools = new LocalToolRegistry();
  const availability = resolveAvailability({ enabled, toolCalling });

  if (availability.available) {
    const provider = new TavilyWebSearchProvider({ apiKey: env.TAVILY_API_KEY });
    const webSearch = createWebSearchTool({ provider });
    tools.register(webSearch.definition, webSearch.handler);
  }

  return { tools, availability };
}

function resolveAvailability({ enabled, toolCalling }) {
  if (!enabled) {
    return { available: false, reason: "disabled" };
  }
  if (!env.TAVILY_API_KEY?.trim()) {
    return { available: false, reason: "missing_api_key" };
  }
  if (!toolCalling) {
    return { available: false, reason: "tool_calling_unsupported" };
  }

  return { available: true };
}

async function runWorkflow(message, tools) {
  const core = createCompanionCore({ model, tools });
  const events = [];

  for await (const event of core.streamWorkflow({
    sessionId: "web-search-verify",
    message,
    workflowOptions: { includeTrace: true },
  })) {
    events.push(event);
  }

  return events;
}

async function runSearchProbe(message) {
  const { tools } = createTools();
  const events = await runWorkflow(message, tools);

  if (!events.some((event) => event.type === "tool:call" && event.call.name === "web_search")) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          reason: "planner_did_not_call_web_search",
          message,
          trace: events
            .filter((event) => event.type === "step:end" || event.type === "tool:result")
            .map((event) => event.type),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  return events;
}

function getFinish(events) {
  return events.find((event) => event.type === "workflow:finish");
}

function getWebSearchResult(events) {
  return events.find((event) => event.type === "tool:result" && event.result.name === "web_search")
    ?.result;
}

function deriveWebSearchMetadata(result) {
  if (result?.result?.search === undefined || result.ok === false) {
    return null;
  }

  return result.result.search;
}

function assertQueryOnlyArguments(argumentsValue) {
  assert(
    typeof argumentsValue === "object" && argumentsValue !== null,
    "tool arguments must be object",
  );
  assert(
    typeof argumentsValue.query === "string" && argumentsValue.query.trim() !== "",
    "query required",
  );
  assert(
    Object.keys(argumentsValue).every((key) => key === "query"),
    `web_search arguments must be query-only, got: ${Object.keys(argumentsValue).join(", ")}`,
  );
}

function hasRelevantFanWeiqiSource(sources) {
  return sources.some((source) =>
    /范|范瑋|范玮|演唱会|concert/i.test(`${source.title} ${source.snippet}`),
  );
}

const disabled = createTools({ enabled: false });
assert(disabled.availability.reason === "disabled", "disabled availability mismatch");
assert(
  (await disabled.tools.list()).every((tool) => tool.name !== "web_search"),
  "disabled must not register web_search",
);

const unsupported = createTools({ toolCalling: false });
assert(
  unsupported.availability.reason === "tool_calling_unsupported",
  "tool_calling_unsupported availability mismatch",
);
assert(
  (await unsupported.tools.list()).every((tool) => tool.name !== "web_search"),
  "unsupported model must not register web_search",
);

const searchEvents = await runSearchProbe("最近 OpenAI 有什么值得关注的吗？");
const searchCall = searchEvents.find(
  (event) => event.type === "tool:call" && event.call.name === "web_search",
);
const searchResult = getWebSearchResult(searchEvents);
const searchFinish = getFinish(searchEvents);
const searchMetadata = deriveWebSearchMetadata(searchResult);

assert(searchCall !== undefined, "expected web_search tool:call");
assertQueryOnlyArguments(searchCall.call.arguments);
assert(searchResult !== undefined, "expected web_search tool:result");
assert(searchResult.ok !== false, "web_search result must succeed");
assert(searchMetadata !== null, "expected derivable web search metadata");
assert(searchMetadata.sources.length >= 1, "expected web search sources");
assert(
  searchEvents.some((event) => event.type === "text:delta"),
  "expected text:delta",
);
assert(searchFinish?.output?.text?.trim(), "expected workflow:finish output text");
assert(
  searchResult.metadata?.externalContext === true &&
    searchResult.metadata?.memoryPolicy === "do_not_store",
  "web_search ToolResult must mark externalContext and memoryPolicy",
);

const stableEvents = await runWorkflow("解释 Promise.all", createTools().tools);
assert(
  !stableEvents.some((event) => event.type === "tool:call" && event.call.name === "web_search"),
  "stable prompt must not call web_search",
);

const secondEvents = await runSearchProbe("本周 AI 芯片市场有什么新消息？");
const secondMetadata = deriveWebSearchMetadata(getWebSearchResult(secondEvents));
assert(secondMetadata !== null, "expected second web search metadata");
assert(
  secondMetadata.query !== searchMetadata.query ||
    JSON.stringify(secondMetadata.sources) !== JSON.stringify(searchMetadata.sources),
  "two web search rounds must not reuse the previous sources",
);
assert(
  !searchEvents.some(
    (event) =>
      event.type === "workflow:error" &&
      String(event.error?.details?.reason ?? "").includes("aborted"),
  ),
  "normal completion must not be marked aborted",
);

const fanWeiqiEvents = await runSearchProbe("范玮琪最新的演唱会是什么时候？");
const fanWeiqiCall = fanWeiqiEvents.find(
  (event) => event.type === "tool:call" && event.call.name === "web_search",
);
const fanWeiqiResult = getWebSearchResult(fanWeiqiEvents);
const fanWeiqiFinish = getFinish(fanWeiqiEvents);
const fanWeiqiMetadata = deriveWebSearchMetadata(fanWeiqiResult);

assert(fanWeiqiCall !== undefined, "expected Fan Weiqi web_search tool:call");
assertQueryOnlyArguments(fanWeiqiCall.call.arguments);
assert(fanWeiqiMetadata !== null, "expected Fan Weiqi web search metadata");
assert(fanWeiqiMetadata.sources.length >= 1, "expected Fan Weiqi web search sources");
assert(
  hasRelevantFanWeiqiSource(fanWeiqiMetadata.sources),
  "Fan Weiqi probe must return relevant concert sources",
);
assert(fanWeiqiFinish?.output?.text?.trim(), "expected Fan Weiqi workflow:finish output text");

console.log(
  JSON.stringify(
    {
      ok: true,
      search: {
        query: searchMetadata.query,
        sourceCount: searchMetadata.sources.length,
        outputLength: searchFinish.output.text.length,
      },
      secondSearch: {
        query: secondMetadata.query,
        sourceCount: secondMetadata.sources.length,
      },
      fanWeiqiSearch: {
        query: fanWeiqiMetadata.query,
        sourceCount: fanWeiqiMetadata.sources.length,
        retrieval: fanWeiqiMetadata.retrieval ?? null,
        outputLength: fanWeiqiFinish.output.text.length,
      },
      noToolEvents: stableEvents.map((event) => event.type),
      availability: {
        disabled: disabled.availability,
        unsupported: unsupported.availability,
      },
    },
    null,
    2,
  ),
);
