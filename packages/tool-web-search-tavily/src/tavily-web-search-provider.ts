import {
  evaluateSearchQuality,
  normalizeWebSearchInput,
  type WebSearchInput,
  type WebSearchProvider,
  type WebSearchResult,
  type WebSearchRetrievalMetadata,
  type WebSearchRetrievalRequest,
} from "@ying-ai/tool-web-search";

import { normalizeRetrievalQuery } from "./normalize-retrieval-query";
import { normalizeTavilyResult } from "./normalize-tavily-result";
import {
  resolveFallbackSearchStrategy,
  resolvePrimarySearchStrategy,
  type ResolvedSearchAttempt,
} from "./search-strategy";
import { TavilyWebSearchError } from "./tavily-web-search-error";

export interface TavilyWebSearchProviderOptions {
  apiKey: string;
  endpoint?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

interface ExecuteSearchResult {
  result: WebSearchResult;
  request: WebSearchRetrievalRequest;
}

export class TavilyWebSearchProvider implements WebSearchProvider {
  public readonly id = "tavily";

  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: TavilyWebSearchProviderOptions) {
    const apiKey = options.apiKey.trim();

    if (apiKey === "") {
      throw new Error("Tavily apiKey is required.");
    }

    this.apiKey = apiKey;
    this.endpoint = options.endpoint ?? "https://api.tavily.com/search";
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  public async search(input: WebSearchInput): Promise<WebSearchResult> {
    const normalized = normalizeWebSearchInput(input);
    const retrievalQuery = normalizeRetrievalQuery(normalized.query);
    const searchInput = { ...normalized, query: retrievalQuery };
    const primaryStrategy = resolvePrimarySearchStrategy(retrievalQuery);
    const primary = await this.executeSearch(searchInput, primaryStrategy, normalized.query, 1);
    const requests = [primary.request];

    if (evaluateSearchQuality(retrievalQuery, primary.result) === "good") {
      return {
        ...primary.result,
        retrieval: buildRetrievalMetadata({
          attempts: 1,
          primaryReason: primaryStrategy.reason,
          fallbackUsed: false,
          plannerQuery: normalized.query,
          retrievalQuery,
          requests,
        }),
      };
    }

    const fallbackStrategy = resolveFallbackSearchStrategy(retrievalQuery, primaryStrategy);

    if (fallbackStrategy === null) {
      return {
        ...primary.result,
        retrieval: buildRetrievalMetadata({
          attempts: 1,
          primaryReason: primaryStrategy.reason,
          fallbackUsed: false,
          plannerQuery: normalized.query,
          retrievalQuery,
          requests,
        }),
      };
    }

    const fallback = await this.executeSearch(searchInput, fallbackStrategy, normalized.query, 2);
    requests.push(fallback.request);

    const mergedUsage = mergeUsage(primary.result.usage, fallback.result.usage);
    const mergedResponseTime = sumResponseTime(
      primary.result.responseTimeMs,
      fallback.result.responseTimeMs,
    );

    const result: WebSearchResult = {
      provider: fallback.result.provider,
      query: normalized.query,
      sources: fallback.result.sources,
      retrieval: buildRetrievalMetadata({
        attempts: 2,
        primaryReason: primaryStrategy.reason,
        fallbackUsed: true,
        plannerQuery: normalized.query,
        retrievalQuery,
        requests,
      }),
    };

    if (mergedResponseTime !== undefined) {
      result.responseTimeMs = mergedResponseTime;
    }
    if (mergedUsage !== undefined) {
      result.usage = mergedUsage;
    }

    return result;
  }

  private async executeSearch(
    normalized: ReturnType<typeof normalizeWebSearchInput>,
    strategy: ResolvedSearchAttempt,
    resultQuery: string,
    attempt: number,
  ): Promise<ExecuteSearchResult> {
    const requestBody = buildTavilyRequestBody(normalized, strategy);
    const controller = new AbortController();
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw createHttpError(response.status);
      }

      const payload = (await response.json()) as unknown;

      if (typeof payload !== "object" || payload === null) {
        throw new TavilyWebSearchError("Tavily request failed", { code: "request_failed" });
      }

      return {
        result: normalizeTavilyResult({
          query: resultQuery,
          response: payload,
          responseTimeMs: Date.now() - startedAt,
        }),
        request: {
          attempt,
          reason: strategy.reason,
          provider: this.id,
          params: requestBody,
        },
      };
    } catch (error) {
      if (error instanceof TavilyWebSearchError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new TavilyWebSearchError("Tavily request timed out", { code: "timeout" });
      }

      throw new TavilyWebSearchError("Tavily request failed", { code: "request_failed" });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildTavilyRequestBody(
  normalized: ReturnType<typeof normalizeWebSearchInput>,
  strategy: ResolvedSearchAttempt,
): Record<string, string | number | boolean> {
  return {
    query: normalized.query,
    topic: strategy.topic,
    ...(strategy.startDate !== undefined ? { start_date: strategy.startDate } : {}),
    ...(strategy.country !== undefined ? { country: strategy.country } : {}),
    search_depth: strategy.searchDepth,
    max_results: normalized.maxResults,
    include_answer: false,
    include_raw_content: false,
    include_images: false,
    include_favicon: true,
    include_usage: true,
    auto_parameters: strategy.autoParameters,
  };
}

function buildRetrievalMetadata(input: {
  attempts: number;
  primaryReason: string;
  fallbackUsed: boolean;
  plannerQuery: string;
  retrievalQuery: string;
  requests: WebSearchRetrievalRequest[];
}): WebSearchRetrievalMetadata {
  return {
    attempts: input.attempts,
    primaryReason: input.primaryReason,
    fallbackUsed: input.fallbackUsed,
    requests: input.requests,
    ...(input.retrievalQuery !== input.plannerQuery
      ? { retrievalQuery: input.retrievalQuery }
      : {}),
  };
}

function mergeUsage(
  primary: WebSearchResult["usage"] | undefined,
  fallback: WebSearchResult["usage"] | undefined,
): WebSearchResult["usage"] | undefined {
  const credits =
    (primary?.credits ?? 0) + (fallback?.credits ?? 0) > 0
      ? (primary?.credits ?? 0) + (fallback?.credits ?? 0)
      : undefined;
  const requestId = fallback?.requestId ?? primary?.requestId;

  if (credits === undefined && requestId === undefined) {
    return undefined;
  }

  return {
    ...(credits !== undefined ? { credits } : {}),
    ...(requestId !== undefined ? { requestId } : {}),
  };
}

function sumResponseTime(
  primary: number | undefined,
  fallback: number | undefined,
): number | undefined {
  if (primary === undefined && fallback === undefined) {
    return undefined;
  }

  return (primary ?? 0) + (fallback ?? 0);
}

function createHttpError(status: number): TavilyWebSearchError {
  if (status === 401 || status === 403) {
    return new TavilyWebSearchError("Tavily authentication failed", {
      code: "authentication_failed",
      status,
    });
  }
  if (status === 429) {
    return new TavilyWebSearchError("Tavily rate limit exceeded", { code: "rate_limited", status });
  }
  if (status === 408) {
    return new TavilyWebSearchError("Tavily request timed out", { code: "timeout", status });
  }
  if (status >= 500) {
    return new TavilyWebSearchError("Tavily service unavailable", {
      code: "service_unavailable",
      status,
    });
  }

  return new TavilyWebSearchError("Tavily request failed", { code: "request_failed", status });
}
