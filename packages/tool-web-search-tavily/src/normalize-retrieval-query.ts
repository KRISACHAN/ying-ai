const YEAR_IN_QUERY_PATTERN = /\b(19|20)\d{2}\b/g;

/** Strip outdated years that models sometimes inject (e.g. 2023 on a 2026 question). */
export function normalizeRetrievalQuery(query: string, now = new Date()): string {
  const currentYear = now.getFullYear();

  return query
    .replace(YEAR_IN_QUERY_PATTERN, (match) => {
      const year = Number(match);
      return year < currentYear ? "" : match;
    })
    .replace(/\s+/g, " ")
    .trim();
}
