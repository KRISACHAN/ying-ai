import type { WebSearchInput } from "./types";

const MAX_SNIPPET_LENGTH = 400;

export interface NormalizedWebSearchInput {
  query: string;
  maxResults: number;
}

export function normalizeWebSearchInput(input: WebSearchInput): NormalizedWebSearchInput {
  return {
    query: input.query.trim(),
    maxResults:
      typeof input.maxResults === "number" && Number.isFinite(input.maxResults)
        ? Math.max(1, Math.min(10, Math.floor(input.maxResults)))
        : 5,
  };
}

export function truncateSnippet(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= MAX_SNIPPET_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_SNIPPET_LENGTH - 1)}…`;
}
