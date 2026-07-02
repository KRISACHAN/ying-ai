import type {
  WebSearchClient,
  WebSearchRequest,
  WebSearchResponse,
  WebSearchSource,
  WebSearchTimeRange,
} from "../abstractions/web-search";
import { WebSearchError } from "../errors/web-search-error";

export interface TavilyWebSearchClientOptions {
  apiKey: string;
  endpoint?: string;
  timeoutMs?: number;
  maxResults?: number;
  retryCount?: number;
  fetch?: typeof fetch;
}

interface TavilyResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  snippet?: unknown;
  published_date?: unknown;
  publishedDate?: unknown;
  score?: unknown;
  favicon?: unknown;
  favicon_url?: unknown;
}

interface TavilyResponse {
  query?: unknown;
  results?: unknown;
}

const DEFAULT_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESULTS = 5;
const MAX_SNIPPET_LENGTH = 500;

export class TavilyWebSearchClient implements WebSearchClient {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxResults: number;
  private readonly retryCount: number;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: TavilyWebSearchClientOptions) {
    const apiKey = options.apiKey.trim();

    if (apiKey === "") {
      throw new WebSearchError("WEB_SEARCH_UNAUTHORIZED", "Tavily API key is required.");
    }

    this.apiKey = apiKey;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.maxResults = Math.max(
      1,
      Math.min(5, Math.floor(options.maxResults ?? DEFAULT_MAX_RESULTS)),
    );
    this.retryCount = Math.max(0, Math.min(2, Math.floor(options.retryCount ?? 1)));
    this.fetchImpl = options.fetch ?? fetch;
  }

  public async search(input: WebSearchRequest): Promise<WebSearchResponse> {
    const query = input.query.trim();

    if (query.length < 2) {
      throw new WebSearchError("WEB_SEARCH_INVALID_QUERY", "Search query is required.");
    }

    const startedAt = Date.now();
    const payload = {
      api_key: this.apiKey,
      query,
      topic: input.topic ?? "general",
      max_results: this.maxResults,
      search_depth: "basic",
      include_answer: false,
      include_raw_content: false,
      include_images: false,
      ...(input.timeRange !== undefined ? { time_range: toTavilyTimeRange(input.timeRange) } : {}),
      ...(input.includeDomains !== undefined ? { include_domains: input.includeDomains } : {}),
      ...(input.excludeDomains !== undefined ? { exclude_domains: input.excludeDomains } : {}),
    };
    const response = await this.fetchWithRetry(payload);
    const sources = normalizeSources(response, this.maxResults);

    return {
      query:
        typeof response.query === "string" && response.query.trim() !== "" ? response.query : query,
      sources,
      provider: "tavily",
      durationMs: Date.now() - startedAt,
      metadata: { sourceCount: sources.length },
    };
  }

  private async fetchWithRetry(payload: Record<string, unknown>): Promise<TavilyResponse> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        return await this.fetchOnce(payload);
      } catch (error) {
        lastError = error;
        if (!shouldRetry(error) || attempt >= this.retryCount) {
          break;
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new WebSearchError("WEB_SEARCH_PROVIDER_ERROR", "Tavily request failed.");
  }

  private async fetchOnce(payload: Record<string, unknown>): Promise<TavilyResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw mapHttpError(response.status);
      }

      const body = (await response.json()) as TavilyResponse;

      if (typeof body !== "object" || body === null) {
        throw new WebSearchError(
          "WEB_SEARCH_PROVIDER_ERROR",
          "Tavily returned an invalid response.",
        );
      }

      return body;
    } catch (error) {
      if (isAbortError(error)) {
        throw new WebSearchError("WEB_SEARCH_TIMEOUT", "Web search timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeSources(response: TavilyResponse, maxResults: number): WebSearchSource[] {
  const results = Array.isArray(response.results) ? response.results : [];
  const seen = new Set<string>();
  const sources: WebSearchSource[] = [];

  for (const item of results) {
    if (!isRecord(item)) {
      continue;
    }

    const normalized = normalizeSource(item as TavilyResult, sources.length + 1);

    if (normalized === null || seen.has(normalized.url)) {
      continue;
    }

    seen.add(normalized.url);
    sources.push(normalized);

    if (sources.length >= maxResults) {
      break;
    }
  }

  return sources;
}

function normalizeSource(item: TavilyResult, index: number): WebSearchSource | null {
  const title = readString(item.title);
  const url = normalizeHttpUrl(readString(item.url));
  const snippet = truncate(
    readString(item.snippet) ?? readString(item.content),
    MAX_SNIPPET_LENGTH,
  );

  if (title === undefined || url === null || snippet === undefined) {
    return null;
  }

  const publishedAt = readString(item.published_date) ?? readString(item.publishedDate);
  const score =
    typeof item.score === "number" && Number.isFinite(item.score) ? item.score : undefined;
  const faviconUrl = normalizeHttpUrl(readString(item.favicon_url) ?? readString(item.favicon));

  return {
    id: `source-${index}`,
    title,
    url,
    snippet,
    ...(publishedAt !== undefined ? { publishedAt } : {}),
    ...(score !== undefined ? { score } : {}),
    ...(faviconUrl !== null ? { faviconUrl } : {}),
  };
}

function normalizeHttpUrl(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function mapHttpError(status: number): WebSearchError {
  if (status === 401 || status === 403) {
    return new WebSearchError(
      "WEB_SEARCH_UNAUTHORIZED",
      "Web search provider rejected credentials.",
      { status },
    );
  }
  if (status === 429) {
    return new WebSearchError(
      "WEB_SEARCH_RATE_LIMITED",
      "Web search provider rate limited the request.",
      { status },
    );
  }
  if (status >= 500) {
    return new WebSearchError("WEB_SEARCH_PROVIDER_ERROR", "Web search provider is unavailable.", {
      status,
    });
  }

  return new WebSearchError(
    "WEB_SEARCH_PROVIDER_ERROR",
    "Web search provider rejected the request.",
    { status },
  );
}

function shouldRetry(error: unknown): boolean {
  return (
    error instanceof WebSearchError &&
    (error.code === "WEB_SEARCH_TIMEOUT" ||
      error.code === "WEB_SEARCH_RATE_LIMITED" ||
      (error.code === "WEB_SEARCH_PROVIDER_ERROR" && (error.status ?? 0) >= 500))
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toTavilyTimeRange(value: WebSearchTimeRange): string {
  const map: Record<WebSearchTimeRange, string> = {
    day: "d",
    week: "w",
    month: "m",
    year: "y",
  };

  return map[value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
