import {
  createWebSearchTool,
  TavilyWebSearchClient,
  type CreatedWebSearchTool,
} from "@ying-companion/tool-web-search";

import type { ChatModel, ModelProfile } from "@ying-companion/ai-core";

import { readOptionalEnv } from "./model-config";

export type WebSearchRuntimeStatus =
  | "enabled"
  | "user_disabled"
  | "infra_unavailable"
  | "model_unsupported";

export interface WebSearchRuntime {
  status: WebSearchRuntimeStatus;
  tool?: CreatedWebSearchTool;
  config: {
    maxResults: number;
    timeoutMs: number;
    retryCount: number;
  };
}

export function resolveWebSearchRuntime(input: {
  env: NodeJS.ProcessEnv;
  model: ChatModel;
  conversationEnabled: boolean;
}): WebSearchRuntime {
  const maxResults = readPositiveInteger(input.env.WEB_SEARCH_MAX_RESULTS, 5, 1, 5);
  const timeoutMs = readPositiveInteger(input.env.WEB_SEARCH_TIMEOUT_MS, 10_000, 100, 60_000);
  const retryCount = readPositiveInteger(input.env.WEB_SEARCH_RETRY_COUNT, 1, 0, 2);
  const config = { maxResults, timeoutMs, retryCount };

  if (!input.conversationEnabled) {
    return { status: "user_disabled", config };
  }

  const apiKey = readOptionalEnv(input.env, "TAVILY_API_KEY");
  const infraEnabled = input.env.WEB_SEARCH_ENABLED?.trim().toLowerCase() !== "false";

  if (apiKey === undefined || !infraEnabled) {
    return { status: "infra_unavailable", config };
  }

  if (!supportsToolCalling(input.model)) {
    return { status: "model_unsupported", config };
  }

  const client = new TavilyWebSearchClient({
    apiKey,
    maxResults,
    timeoutMs,
    retryCount,
  });

  return {
    status: "enabled",
    tool: createWebSearchTool(client, { maxResults }),
    config,
  };
}

function supportsToolCalling(model: ChatModel): boolean {
  return [model.primaryProfile, model.fallbackProfile].some(
    (profile): profile is ModelProfile =>
      profile !== undefined && profile.capabilities.toolCalling === true,
  );
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}
