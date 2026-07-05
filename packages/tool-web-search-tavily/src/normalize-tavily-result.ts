import { truncateSnippet } from "@ying-companion/tool-web-search";
import type { WebSearchResult, WebSearchSource } from "@ying-companion/tool-web-search";

import { scoreUpcomingEventRelevance } from "./extract-event-dates";

export interface TavilySearchResponse {
  results?: unknown;
  response_time?: unknown;
  usage?: unknown;
  request_id?: unknown;
}

interface TavilyResultItem {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  score?: unknown;
  favicon?: unknown;
  favicon_url?: unknown;
  published_date?: unknown;
  published_at?: unknown;
}

export function normalizeTavilyResult(input: {
  query: string;
  response: TavilySearchResponse;
  responseTimeMs?: number;
  retrieval?: WebSearchResult["retrieval"];
  now?: Date;
}): WebSearchResult {
  const sources = rankSourcesByRecency(
    Array.isArray(input.response.results)
      ? input.response.results.flatMap((item, index) => normalizeSource(item, index))
      : [],
    input.now ?? new Date(),
  );
  const usage = normalizeUsage(input.response);
  const responseTimeMs = normalizeResponseTime(input.response.response_time, input.responseTimeMs);

  return {
    provider: "tavily",
    query: input.query,
    sources,
    ...(responseTimeMs !== undefined ? { responseTimeMs } : {}),
    ...(usage !== undefined ? { usage } : {}),
    ...(input.retrieval !== undefined ? { retrieval: input.retrieval } : {}),
  };
}

function normalizeSource(item: unknown, index: number): WebSearchSource[] {
  if (typeof item !== "object" || item === null) {
    return [];
  }

  const raw = item as TavilyResultItem;
  const title = readNonEmptyString(raw.title);
  const url = readNonEmptyString(raw.url);
  const content = readNonEmptyString(raw.content);

  if (title === undefined || url === undefined || content === undefined) {
    return [];
  }

  const faviconUrl = readNonEmptyString(raw.favicon_url) ?? readNonEmptyString(raw.favicon);
  const publishedAt = normalizeDate(raw.published_at) ?? normalizeDate(raw.published_date);
  const score = typeof raw.score === "number" && Number.isFinite(raw.score) ? raw.score : undefined;

  return [
    {
      id: createSourceId(url, index),
      title,
      url,
      snippet: truncateSnippet(content),
      ...(score !== undefined ? { score } : {}),
      ...(faviconUrl !== undefined ? { faviconUrl } : {}),
      ...(publishedAt !== undefined ? { publishedAt } : {}),
    },
  ];
}

function normalizeUsage(response: TavilySearchResponse): WebSearchResult["usage"] | undefined {
  const usage = typeof response.usage === "object" && response.usage !== null ? response.usage : {};
  const credits = (usage as { credits_used?: unknown }).credits_used;
  const requestId = readNonEmptyString(response.request_id);
  const result: NonNullable<WebSearchResult["usage"]> = {};

  if (typeof credits === "number" && Number.isFinite(credits)) {
    result.credits = credits;
  }
  if (requestId !== undefined) {
    result.requestId = requestId;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeResponseTime(value: unknown, fallback: number | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value < 1000 ? Math.round(value * 1000) : Math.round(value);
  }

  return fallback;
}

function normalizeDate(value: unknown): string | undefined {
  const raw = readNonEmptyString(value);

  if (raw === undefined) {
    return undefined;
  }

  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed !== "" ? trimmed : undefined;
}

function rankSourcesByRecency(sources: WebSearchSource[], now: Date): WebSearchSource[] {
  return [...sources].sort((left, right) => {
    const leftText = `${left.title} ${left.snippet}`;
    const rightText = `${right.title} ${right.snippet}`;
    const relevanceDelta =
      scoreUpcomingEventRelevance(rightText, now) - scoreUpcomingEventRelevance(leftText, now);

    if (relevanceDelta !== 0) {
      return relevanceDelta;
    }

    return (right.score ?? 0) - (left.score ?? 0);
  });
}

function createSourceId(url: string | undefined, index: number): string {
  if (url === undefined) {
    return `source-${index}`;
  }

  let hash = 5381;

  for (let i = 0; i < url.length; i += 1) {
    hash = (hash * 33) ^ url.charCodeAt(i);
  }

  return `url-${(hash >>> 0).toString(36)}`;
}
