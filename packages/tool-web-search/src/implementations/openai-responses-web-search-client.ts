import type {
  WebSearchClient,
  WebSearchRequest,
  WebSearchResponse,
  WebSearchSource,
} from "../abstractions/web-search";
import { WebSearchError } from "../errors/web-search-error";

export interface OpenAIResponsesWebSearchClientOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxResults?: number;
  retryCount?: number;
  fetch?: typeof fetch;
}

interface OpenAIResponsesBody {
  output?: unknown;
}

interface ExtractedSource {
  title?: string;
  url?: string;
  snippet?: string;
}

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESULTS = 5;
const MAX_SNIPPET_LENGTH = 500;

export class OpenAIResponsesWebSearchClient implements WebSearchClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxResults: number;
  private readonly retryCount: number;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: OpenAIResponsesWebSearchClientOptions) {
    const apiKey = options.apiKey.trim();
    const model = options.model.trim();

    if (apiKey === "") {
      throw new WebSearchError("WEB_SEARCH_UNAUTHORIZED", "OpenAI API key is required.");
    }
    if (model === "") {
      throw new WebSearchError("WEB_SEARCH_PROVIDER_ERROR", "OpenAI web search model is required.");
    }

    this.apiKey = apiKey;
    this.model = model;
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
    const response = await this.fetchWithRetry({
      model: this.model,
      input: buildSearchInput(query),
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
    });
    const sources = normalizeSources(response, this.maxResults);

    if (sources.length === 0) {
      throw new WebSearchError(
        "WEB_SEARCH_NO_RESULTS",
        "OpenAI Responses returned no structured web search sources.",
      );
    }

    return {
      query,
      sources,
      provider: "openai-responses",
      durationMs: Date.now() - startedAt,
      metadata: {
        sourceCount: sources.length,
        model: this.model,
      },
    };
  }

  private async fetchWithRetry(payload: Record<string, unknown>): Promise<OpenAIResponsesBody> {
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
      : new WebSearchError("WEB_SEARCH_PROVIDER_ERROR", "OpenAI Responses request failed.");
  }

  private async fetchOnce(payload: Record<string, unknown>): Promise<OpenAIResponsesBody> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw mapHttpError(response.status);
      }

      const body = (await response.json()) as OpenAIResponsesBody;

      if (typeof body !== "object" || body === null) {
        throw new WebSearchError(
          "WEB_SEARCH_PROVIDER_ERROR",
          "OpenAI Responses returned an invalid response.",
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

function buildSearchInput(query: string): string {
  return [
    "Search the web before answering this request.",
    "Return answer text only if it is backed by structured web search citations.",
    "Do not answer from memory without web search citations.",
    `User query: ${query}`,
  ].join("\n");
}

function normalizeSources(response: OpenAIResponsesBody, maxResults: number): WebSearchSource[] {
  const extracted = [
    ...extractCitationSources(response.output),
    ...extractWebSearchActionSources(response.output),
  ];
  const seen = new Set<string>();
  const sources: WebSearchSource[] = [];

  for (const source of extracted) {
    const url = normalizeHttpUrl(source.url);
    const title = source.title?.trim();

    if (url === null || title === undefined || title === "" || seen.has(url)) {
      continue;
    }

    seen.add(url);
    sources.push({
      id: `source-${sources.length + 1}`,
      title,
      url,
      ...(source.snippet !== undefined
        ? { snippet: truncate(source.snippet, MAX_SNIPPET_LENGTH) }
        : {}),
    });

    if (sources.length >= maxResults) {
      break;
    }
  }

  return sources;
}

function extractCitationSources(value: unknown): ExtractedSource[] {
  const sources: ExtractedSource[] = [];

  visitRecords(value, (record) => {
    if (record.type !== "url_citation") {
      return;
    }

    const url = readString(record.url);
    const title = readString(record.title) ?? url;

    if (url !== undefined && title !== undefined) {
      sources.push({ title, url });
    }
  });

  return sources;
}

function extractWebSearchActionSources(value: unknown): ExtractedSource[] {
  const sources: ExtractedSource[] = [];

  visitRecords(value, (record) => {
    const action = isRecord(record.action) ? record.action : undefined;
    const rawSources = Array.isArray(action?.sources) ? action.sources : undefined;

    if (rawSources === undefined) {
      return;
    }

    for (const item of rawSources) {
      if (!isRecord(item)) {
        continue;
      }

      const url = readString(item.url);
      const title = readString(item.title) ?? url;
      const snippet = readString(item.snippet) ?? readString(item.text);

      if (url !== undefined && title !== undefined) {
        sources.push({ title, url, ...(snippet !== undefined ? { snippet } : {}) });
      }
    }
  });

  return sources;
}

function visitRecords(value: unknown, visitor: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitRecords(item, visitor);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  visitor(value);

  for (const item of Object.values(value)) {
    if (typeof item === "object" && item !== null) {
      visitRecords(item, visitor);
    }
  }
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

function truncate(value: string, maxLength: number): string {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
