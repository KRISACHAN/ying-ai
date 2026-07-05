export type WebSearchProviderId = string;

export interface WebSearchInput {
  query: string;
  maxResults?: number;
}

export interface WebSearchRetrievalRequest {
  attempt: number;
  reason: string;
  provider: WebSearchProviderId;
  params: Record<string, string | number | boolean>;
}

export interface WebSearchRetrievalMetadata {
  attempts: number;
  primaryReason: string;
  fallbackUsed: boolean;
  retrievalQuery?: string;
  requests?: WebSearchRetrievalRequest[];
}

export interface WebSearchSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
  score?: number;
  faviconUrl?: string;
  publishedAt?: string;
}

export interface WebSearchResult {
  provider: WebSearchProviderId;
  query: string;
  sources: WebSearchSource[];
  responseTimeMs?: number;
  usage?: {
    credits?: number;
    requestId?: string;
  };
  retrieval?: WebSearchRetrievalMetadata;
}

export interface WebSearchProvider {
  readonly id: WebSearchProviderId;
  search(input: WebSearchInput): Promise<WebSearchResult>;
}

export interface WebSearchToolModelPayload {
  usageInstructions: string;
  search: WebSearchResult;
}
