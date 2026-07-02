export type WebSearchTopic = "general" | "news";
export type WebSearchTimeRange = "day" | "week" | "month" | "year";

export interface WebSearchRequest {
  query: string;
  topic?: WebSearchTopic;
  timeRange?: WebSearchTimeRange;
  includeDomains?: string[];
  excludeDomains?: string[];
}

export interface WebSearchSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  score?: number;
  faviconUrl?: string;
}

export interface WebSearchResponse {
  query: string;
  sources: WebSearchSource[];
  provider: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface WebSearchClient {
  search(input: WebSearchRequest): Promise<WebSearchResponse>;
}
