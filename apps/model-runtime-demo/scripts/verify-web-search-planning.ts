import assert from "node:assert/strict";

import type {
  ChatMessage,
  ChatModel,
  GenerateInput,
  GenerateOutput,
} from "@ying-companion/ai-core";

import { DemoWebSearchPlanningProvider } from "../app/lib/web-search-planning-provider";
import { resolveWebSearchRuntime } from "../app/lib/web-search-runtime";

async function main(): Promise<void> {
  await verifiesForcePlanning();
  await verifiesExplicitIntentPlanning();
  await verifiesExplicitIntentQueryNormalization();
  await verifiesInformationSeekingPlanning();
  await verifiesNoNativeNoToolForCasualChat();
  await verifiesNativePlanningDelegation();
  verifiesBackendSelection();
  verifiesConversationDisabledPreventsRegistration();
  console.log("verify:web-search-planning passed");
}

async function verifiesExplicitIntentQueryNormalization(): Promise<void> {
  const planner = new DemoWebSearchPlanningProvider({
    modelSupportsNativeToolCalling: false,
  });
  const plan = await planner.plan({
    model: new PlannerVerifierModel(false),
    messages: userMessages("帮我查一下今天新加坡天气怎么样？"),
    tools: { web_search: {} },
  });

  assert.equal(plan.type, "tool_calls");
  assert.equal(plan.type === "tool_calls" ? plan.calls[0]?.name : "", "web_search");
  assert.equal(
    plan.type === "tool_calls" ? (plan.calls[0]?.arguments as { query?: unknown }).query : "",
    "今天新加坡天气怎么样",
  );
  assert.equal(planner.getLastMode(), "explicit-intent");
}

async function verifiesInformationSeekingPlanning(): Promise<void> {
  const planner = new DemoWebSearchPlanningProvider({
    modelSupportsNativeToolCalling: false,
  });
  const plan = await planner.plan({
    model: new PlannerVerifierModel(false),
    messages: userMessages("《虾仁短剧》是什么"),
    tools: { web_search: {} },
  });

  assert.equal(plan.type, "tool_calls");
  assert.equal(plan.type === "tool_calls" ? plan.calls[0]?.name : "", "web_search");
  assert.equal(
    plan.type === "tool_calls" ? (plan.calls[0]?.arguments as { query?: unknown }).query : "",
    "《虾仁短剧》",
  );
  assert.equal(planner.getLastMode(), "information-seeking");
}

async function verifiesForcePlanning(): Promise<void> {
  const planner = new DemoWebSearchPlanningProvider({
    forceWebSearch: true,
    modelSupportsNativeToolCalling: false,
  });
  const plan = await planner.plan({
    model: new PlannerVerifierModel(false),
    messages: userMessages("今天新加坡天气怎么样？"),
    tools: { web_search: {} },
  });

  assert.equal(plan.type, "tool_calls");
  assert.equal(plan.type === "tool_calls" ? plan.calls[0]?.name : "", "web_search");
  assert.equal(planner.getLastMode(), "host-forced");
}

async function verifiesExplicitIntentPlanning(): Promise<void> {
  const planner = new DemoWebSearchPlanningProvider({
    modelSupportsNativeToolCalling: false,
  });
  const plan = await planner.plan({
    model: new PlannerVerifierModel(false),
    messages: userMessages("帮我查一下今天新加坡天气怎么样？"),
    tools: { web_search: {} },
  });

  assert.equal(plan.type, "tool_calls");
  assert.equal(plan.type === "tool_calls" ? plan.calls[0]?.name : "", "web_search");
  assert.equal(planner.getLastMode(), "explicit-intent");
}

async function verifiesNoNativeNoToolForCasualChat(): Promise<void> {
  const planner = new DemoWebSearchPlanningProvider({
    modelSupportsNativeToolCalling: false,
  });
  const plan = await planner.plan({
    model: new PlannerVerifierModel(false),
    messages: userMessages("陪我聊聊天"),
    tools: { web_search: {} },
  });

  assert.equal(plan.type, "no_tool");
  assert.equal(plan.type === "no_tool" ? plan.reason : undefined, "tool_calling_unavailable");
  assert.equal(planner.getLastMode(), "no-tool");
}

async function verifiesNativePlanningDelegation(): Promise<void> {
  const planner = new DemoWebSearchPlanningProvider({
    modelSupportsNativeToolCalling: true,
  });
  const plan = await planner.plan({
    model: new PlannerVerifierModel(true),
    messages: userMessages("陪我聊聊天"),
    tools: { web_search: {} },
  });

  assert.equal(plan.type, "no_tool");
  assert.equal(planner.getLastMode(), "model-native");
}

function verifiesBackendSelection(): void {
  const openAI = resolveWebSearchRuntime({
    conversationEnabled: true,
    env: env({
      WEB_SEARCH_BACKEND: "auto",
      OPENAI_WEB_SEARCH_API_KEY: "openai-key",
      OPENAI_WEB_SEARCH_MODEL: "gpt-test-search",
      TAVILY_API_KEY: "tavily-key",
    }),
  });
  assert.equal(openAI.status, "enabled");
  assert.equal(openAI.backend, "openai-responses");

  const tavily = resolveWebSearchRuntime({
    conversationEnabled: true,
    env: env({
      WEB_SEARCH_BACKEND: "auto",
      TAVILY_API_KEY: "tavily-key",
    }),
  });
  assert.equal(tavily.status, "enabled");
  assert.equal(tavily.backend, "tavily");

  const proxyChatKeyOnly = resolveWebSearchRuntime({
    conversationEnabled: true,
    env: env({
      WEB_SEARCH_BACKEND: "auto",
      OPENAI_API_KEY: "proxy-chat-key",
      OPENAI_MODEL: "gpt-4o-mini",
      TAVILY_API_KEY: "tavily-key",
    }),
  });
  assert.equal(proxyChatKeyOnly.status, "enabled");
  assert.equal(proxyChatKeyOnly.backend, "tavily");

  const forcedOpenAI = resolveWebSearchRuntime({
    conversationEnabled: true,
    env: env({
      WEB_SEARCH_BACKEND: "openai-responses",
      TAVILY_API_KEY: "tavily-key",
    }),
  });
  assert.equal(forcedOpenAI.status, "infra_unavailable");
  assert.equal(forcedOpenAI.tool, undefined);
}

function verifiesConversationDisabledPreventsRegistration(): void {
  const runtime = resolveWebSearchRuntime({
    conversationEnabled: false,
    env: env({
      WEB_SEARCH_BACKEND: "auto",
      OPENAI_WEB_SEARCH_API_KEY: "openai-key",
      OPENAI_WEB_SEARCH_MODEL: "gpt-test-search",
      TAVILY_API_KEY: "tavily-key",
    }),
  });

  assert.equal(runtime.status, "user_disabled");
  assert.equal(runtime.tool, undefined);
  assert.equal(runtime.backend, undefined);
}

function userMessages(content: string): ChatMessage[] {
  return [{ role: "user", content }];
}

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

class PlannerVerifierModel implements ChatModel {
  public readonly meta = {
    id: "model.planning-verifier",
    kind: "model",
    name: "Planning Verifier Model",
  } as const;

  public readonly primaryProfile;

  public constructor(toolCalling: boolean) {
    this.primaryProfile = {
      provider: "verifier",
      model: "verifier-model",
      capabilities: { streaming: false, toolCalling, usage: false },
    };
  }

  public async generate(input: GenerateInput): Promise<GenerateOutput> {
    if (
      input.requiredCapabilities?.toolCalling === true &&
      !this.primaryProfile.capabilities.toolCalling
    ) {
      throw new Error("tool calling unavailable");
    }

    return {
      text: "",
      model: this.primaryProfile.model,
      raw: {},
      toolCalls: [],
    };
  }

  public stream(): AsyncIterable<never> {
    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<never>> {
            return { done: true, value: undefined as never };
          },
        };
      },
    };
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
