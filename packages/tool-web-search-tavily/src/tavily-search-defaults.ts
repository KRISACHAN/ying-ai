/** Tavily start_date for web_search — only content from the current calendar year onward. */
export function getDefaultStartDate(now = new Date()): string {
  return `${now.getFullYear()}-01-01`;
}
