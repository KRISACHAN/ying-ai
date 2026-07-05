import { containsCjk } from "./text-utils";
import type { WebSearchResult } from "./types";

export type SearchQuality = "good" | "poor";

const MIN_TOP_SCORE = 0.15;

export function evaluateSearchQuality(query: string, result: WebSearchResult): SearchQuality {
  if (result.sources.length === 0) {
    return "poor";
  }

  const topScore = Math.max(
    ...result.sources.map((source) => (typeof source.score === "number" ? source.score : 0)),
  );

  if (topScore < MIN_TOP_SCORE) {
    return "poor";
  }

  if (containsCjk(query) && !hasCjkInTopSources(result, 3)) {
    return "poor";
  }

  return "good";
}

function hasCjkInTopSources(result: WebSearchResult, limit: number): boolean {
  return result.sources.slice(0, limit).some((source) => {
    const text = `${source.title} ${source.snippet}`;
    return containsCjk(text);
  });
}
