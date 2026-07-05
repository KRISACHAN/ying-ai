import type { WebSearchResult, WebSearchToolModelPayload } from "./types";

function buildUsageInstructions(now = new Date()): string {
  const today = formatIsoDate(now);

  return [
    "The following content came from external Web Search, not built-in model knowledge.",
    `Today is ${today}. When the question involves today, latest, current, or recent relative time, interpret it against this date.`,
    "Use only facts supported by search.sources.",
    "Do not invent URLs, titles, publication times, people, status, scores, exact numbers, or citations.",
    "When sources conflict, state the conflict explicitly; do not fill in missing conclusions.",
    "If the sources are insufficient to confirm a claim, say the information is uncertain; do not guess.",
    "Provider-generated answer text, if present, is auxiliary only and not the sole fact source.",
    "Organize the final user-facing reply from the structured search.sources.",
  ].join(" ");
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatWebSearchForModel(search: WebSearchResult): WebSearchToolModelPayload {
  return {
    usageInstructions: buildUsageInstructions(),
    search,
  };
}
