import type {
  WebSearchProviderId,
  WebSearchRetrievalMetadata,
  WebSearchSource,
} from "@ying-companion/tool-web-search";
import type { ToolResult } from "@ying-companion/ai-core";

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

export function deriveWebSearchMetadataFromToolResult(
  result: Pick<ToolResult, "name" | "ok" | "result">,
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
