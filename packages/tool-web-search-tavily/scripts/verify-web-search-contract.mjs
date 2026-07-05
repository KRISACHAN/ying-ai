/* global console, process */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TavilyWebSearchProvider } from "../dist/index.js";

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

function assertSourceShape(sources) {
  for (const [index, source] of sources.entries()) {
    assert(typeof source.id === "string" && source.id.length > 0, `source ${index} id missing`);
    assert(
      typeof source.title === "string" && source.title.length > 0,
      `source ${index} title missing`,
    );
    assert(typeof source.url === "string" && source.url.length > 0, `source ${index} url missing`);
    assert(
      typeof source.snippet === "string" && source.snippet.length > 0,
      `source ${index} snippet missing`,
    );
    assert(source.snippet.length <= 400, `source ${index} snippet too long`);
    assert(!("raw_content" in source), `source ${index} must not expose raw_content`);
  }
}

function hasRelevantFanWeiqiSource(sources) {
  return sources.some((source) =>
    /范|范瑋|范玮|演唱会|concert/i.test(`${source.title} ${source.snippet}`),
  );
}

const envPath = resolve(process.cwd(), "../../apps/model-runtime-demo/.env");
const env = { ...loadEnvFile(envPath), ...process.env };
const apiKey = env.TAVILY_API_KEY?.trim();

if (!apiKey) {
  console.error("请配置 apps/model-runtime-demo/.env: TAVILY_API_KEY");
  process.exit(1);
}

const provider = new TavilyWebSearchProvider({ apiKey });

const englishResult = await provider.search({
  query: "OpenAI latest news",
  maxResults: 5,
});

assert(englishResult.provider === "tavily", "provider must be tavily");
assert(englishResult.query === "OpenAI latest news", "query mismatch");
assert(englishResult.sources.length >= 1, "expected at least one English source");
assertSourceShape(englishResult.sources);
assert(englishResult.retrieval !== undefined, "expected retrieval metadata");
assert(englishResult.retrieval.attempts >= 1, "expected at least one retrieval attempt");

const fanWeiqiResult = await provider.search({
  query: "范玮琪 最新 演唱会",
  maxResults: 5,
});

assert(fanWeiqiResult.sources.length >= 1, "expected at least one Fan Weiqi source");
assertSourceShape(fanWeiqiResult.sources);
assert(
  hasRelevantFanWeiqiSource(fanWeiqiResult.sources),
  "Fan Weiqi probe must return relevant concert sources",
);
assert(fanWeiqiResult.retrieval !== undefined, "expected Fan Weiqi retrieval metadata");

if (fanWeiqiResult.responseTimeMs !== undefined) {
  assert(typeof fanWeiqiResult.responseTimeMs === "number", "responseTimeMs must be number");
}
if (fanWeiqiResult.usage?.credits !== undefined) {
  assert(typeof fanWeiqiResult.usage.credits === "number", "usage.credits must be number");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      english: {
        query: englishResult.query,
        sourceCount: englishResult.sources.length,
        retrieval: englishResult.retrieval,
        credits: englishResult.usage?.credits ?? null,
      },
      fanWeiqi: {
        query: fanWeiqiResult.query,
        sourceCount: fanWeiqiResult.sources.length,
        retrieval: fanWeiqiResult.retrieval,
        credits: fanWeiqiResult.usage?.credits ?? null,
      },
    },
    null,
    2,
  ),
);
