import {
  createWebSearchTool,
  type WebSearchProvider,
  type WebSearchProviderId,
  type WebSearchRetrievalMetadata,
  type WebSearchSource,
} from "@ying-companion/tool-web-search";
import { TavilyWebSearchProvider } from "@ying-companion/tool-web-search-tavily";
import type { ModelCapabilities, ToolResult } from "@ying-companion/ai-core";

import { readOptionalEnv } from "./model-config";
import type { WebSearchAvailability } from "./web-search-availability";

export type { WebSearchAvailability } from "./web-search-availability";

export interface DemoWorkflowWebSearchMetadata {
  query: string;
  provider: WebSearchProviderId;
  sources: WebSearchSource[];
  responseTimeMs?: number;
  usage?: {
    credits?: number;
    requestId?: string;
  };
  retrieval?: WebSearchRetrievalMetadata;
}

export function resolveWebSearchAvailability(
  env: NodeJS.ProcessEnv,
  modelCapabilities: ModelCapabilities,
): WebSearchAvailability {
  if (readOptionalEnv(env, "WEB_SEARCH_ENABLED") !== "true") {
    return { available: false, reason: "disabled" };
  }
  if (modelCapabilities.toolCalling !== true) {
    return { available: false, reason: "tool_calling_unsupported" };
  }

  const backend = readOptionalEnv(env, "WEB_SEARCH_BACKEND") ?? "tavily";

  if (backend !== "tavily") {
    return { available: false, reason: "unsupported_backend" };
  }

  if (readOptionalEnv(env, "TAVILY_API_KEY") === undefined) {
    return { available: false, reason: "missing_api_key" };
  }

  return { available: true };
}

export function createWebSearchProviderFromEnv(
  env: NodeJS.ProcessEnv,
  options?: { fetch?: typeof fetch },
): WebSearchProvider | null {
  const backend = readOptionalEnv(env, "WEB_SEARCH_BACKEND") ?? "tavily";

  switch (backend) {
    case "tavily": {
      const apiKey = readOptionalEnv(env, "TAVILY_API_KEY");

      if (apiKey === undefined) {
        return null;
      }

      try {
        return new TavilyWebSearchProvider({
          apiKey,
          ...(options?.fetch !== undefined ? { fetch: options.fetch } : {}),
        });
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}

export function createWebSearchToolIfAvailable(input: {
  env: NodeJS.ProcessEnv;
  modelCapabilities: ModelCapabilities;
  fetch?: typeof fetch;
}): { availability: WebSearchAvailability; tool?: ReturnType<typeof createWebSearchTool> } {
  const availability = resolveWebSearchAvailability(input.env, input.modelCapabilities);

  if (!availability.available) {
    return { availability };
  }

  const provider = createWebSearchProviderFromEnv(input.env, {
    ...(input.fetch !== undefined ? { fetch: input.fetch } : {}),
  });

  if (provider === null) {
    return { availability: { available: false, reason: "provider_initialization_failed" } };
  }

  return {
    availability,
    tool: createWebSearchTool({ provider }),
  };
}

export function deriveWebSearchMetadataFromToolResult(
  result: ToolResult,
): DemoWorkflowWebSearchMetadata | null {
  if (result.name !== "web_search" || result.ok === false) {
    return null;
  }
  if (typeof result.result !== "object" || result.result === null) {
    return null;
  }

  const search = (result.result as { search?: unknown }).search;

  if (typeof search !== "object" || search === null) {
    return null;
  }

  const record = search as {
    query?: unknown;
    provider?: unknown;
    sources?: unknown;
    responseTimeMs?: unknown;
    usage?: unknown;
    retrieval?: unknown;
  };

  if (
    typeof record.query !== "string" ||
    typeof record.provider !== "string" ||
    !Array.isArray(record.sources)
  ) {
    return null;
  }

  return {
    query: record.query,
    provider: record.provider,
    sources: record.sources.filter(isWebSearchSource),
    ...(typeof record.responseTimeMs === "number" ? { responseTimeMs: record.responseTimeMs } : {}),
    ...(isUsage(record.usage) ? { usage: record.usage } : {}),
    ...(isRetrieval(record.retrieval) ? { retrieval: record.retrieval } : {}),
  };
}

function isRetrieval(value: unknown): value is WebSearchRetrievalMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.attempts === "number" &&
    typeof record.primaryReason === "string" &&
    typeof record.fallbackUsed === "boolean"
  );
}

function isWebSearchSource(value: unknown): value is WebSearchSource {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const source = value as Partial<WebSearchSource>;
  return (
    typeof source.id === "string" &&
    typeof source.title === "string" &&
    typeof source.url === "string" &&
    typeof source.snippet === "string"
  );
}

function isUsage(value: unknown): value is NonNullable<DemoWorkflowWebSearchMetadata["usage"]> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const usage = value as { credits?: unknown; requestId?: unknown };
  return (
    (usage.credits === undefined || typeof usage.credits === "number") &&
    (usage.requestId === undefined || typeof usage.requestId === "string")
  );
}
