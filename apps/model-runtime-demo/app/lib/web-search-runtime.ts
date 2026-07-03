import {
  createWebSearchTool,
  OpenAIResponsesWebSearchClient,
  TavilyWebSearchClient,
  type CreatedWebSearchTool,
} from "@ying-companion/tool-web-search";

import { readOptionalEnv } from "./model-config";

export type WebSearchRuntimeStatus = "enabled" | "user_disabled" | "infra_unavailable";
export type WebSearchRuntimeRequestedBackend = "auto" | WebSearchBackend;
export type WebSearchBackend = "tavily" | "openai-responses";
export type WebSearchRuntimeReason =
  | "missing_openai_responses_config"
  | "missing_tavily_config"
  | "web_search_disabled"
  | "openai_web_search_disabled"
  | "user_disabled";

export interface WebSearchRuntime {
  status: WebSearchRuntimeStatus;
  backend?: WebSearchBackend;
  tool?: CreatedWebSearchTool;
  config: {
    requestedBackend: WebSearchRuntimeRequestedBackend;
    maxResults: number;
    timeoutMs: number;
    retryCount: number;
  };
  reason?: WebSearchRuntimeReason;
}

export function resolveWebSearchRuntime(input: {
  env: NodeJS.ProcessEnv;
  conversationEnabled: boolean;
}): WebSearchRuntime {
  const maxResults = readPositiveInteger(input.env.WEB_SEARCH_MAX_RESULTS, 5, 1, 5);
  const timeoutMs = readPositiveInteger(input.env.WEB_SEARCH_TIMEOUT_MS, 10_000, 100, 60_000);
  const retryCount = readPositiveInteger(input.env.WEB_SEARCH_RETRY_COUNT, 1, 0, 2);
  const requestedBackend = readWebSearchBackend(input.env.WEB_SEARCH_BACKEND);
  const config = { requestedBackend, maxResults, timeoutMs, retryCount };

  if (!input.conversationEnabled) {
    return { status: "user_disabled", config, reason: "user_disabled" };
  }

  if (requestedBackend === "openai-responses") {
    return (
      tryCreateOpenAIResponsesRuntime(input.env, config, { allowChatApiKeyFallback: true }) ?? {
        status: "infra_unavailable",
        config,
        reason: readOpenAIWebSearchReason(input.env),
      }
    );
  }

  if (requestedBackend === "tavily") {
    return (
      tryCreateTavilyRuntime(input.env, config) ?? {
        status: "infra_unavailable",
        config,
        reason: readTavilyReason(input.env),
      }
    );
  }

  return (
    tryCreateOpenAIResponsesRuntime(input.env, config, { allowChatApiKeyFallback: false }) ??
    tryCreateTavilyRuntime(input.env, config) ?? {
      status: "infra_unavailable",
      config,
      reason:
        readOpenAIWebSearchReason(input.env) === "openai_web_search_disabled"
          ? readTavilyReason(input.env)
          : readOpenAIWebSearchReason(input.env),
    }
  );
}

function tryCreateTavilyRuntime(
  env: NodeJS.ProcessEnv,
  config: WebSearchRuntime["config"],
): WebSearchRuntime | null {
  const apiKey = readOptionalEnv(env, "TAVILY_API_KEY");
  const infraEnabled = env.WEB_SEARCH_ENABLED?.trim().toLowerCase() !== "false";

  if (apiKey === undefined || !infraEnabled) {
    return null;
  }

  const client = new TavilyWebSearchClient({
    apiKey,
    maxResults: config.maxResults,
    timeoutMs: config.timeoutMs,
    retryCount: config.retryCount,
  });

  return {
    status: "enabled",
    backend: "tavily",
    tool: createWebSearchTool(client, { maxResults: config.maxResults }),
    config,
  };
}

function tryCreateOpenAIResponsesRuntime(
  env: NodeJS.ProcessEnv,
  config: WebSearchRuntime["config"],
  options: { allowChatApiKeyFallback: boolean },
): WebSearchRuntime | null {
  const enabled = env.OPENAI_WEB_SEARCH_ENABLED?.trim().toLowerCase() !== "false";
  const dedicatedApiKey = readOptionalEnv(env, "OPENAI_WEB_SEARCH_API_KEY");
  const apiKey =
    dedicatedApiKey ??
    (options.allowChatApiKeyFallback ? readOptionalEnv(env, "OPENAI_API_KEY") : undefined);
  const dedicatedModel = readOptionalEnv(env, "OPENAI_WEB_SEARCH_MODEL");
  const model =
    dedicatedModel ??
    (dedicatedApiKey !== undefined || options.allowChatApiKeyFallback
      ? readOptionalEnv(env, "OPENAI_MODEL")
      : undefined);

  if (!enabled || apiKey === undefined || model === undefined) {
    return null;
  }

  const client = new OpenAIResponsesWebSearchClient({
    apiKey,
    model,
    maxResults: config.maxResults,
    timeoutMs: config.timeoutMs,
    retryCount: config.retryCount,
  });

  return {
    status: "enabled",
    backend: "openai-responses",
    tool: createWebSearchTool(client, { maxResults: config.maxResults }),
    config,
  };
}

function readOpenAIWebSearchReason(env: NodeJS.ProcessEnv): WebSearchRuntimeReason {
  if (env.OPENAI_WEB_SEARCH_ENABLED?.trim().toLowerCase() === "false") {
    return "openai_web_search_disabled";
  }

  return "missing_openai_responses_config";
}

function readTavilyReason(env: NodeJS.ProcessEnv): WebSearchRuntimeReason {
  if (env.WEB_SEARCH_ENABLED?.trim().toLowerCase() === "false") {
    return "web_search_disabled";
  }

  return "missing_tavily_config";
}

function readWebSearchBackend(value: string | undefined): WebSearchRuntimeRequestedBackend {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "tavily" || normalized === "openai-responses") {
    return normalized;
  }

  return "auto";
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
