export type WebSearchErrorCode =
  | "WEB_SEARCH_DISABLED"
  | "WEB_SEARCH_INVALID_QUERY"
  | "WEB_SEARCH_TIMEOUT"
  | "WEB_SEARCH_RATE_LIMITED"
  | "WEB_SEARCH_UNAUTHORIZED"
  | "WEB_SEARCH_PROVIDER_ERROR"
  | "WEB_SEARCH_NO_RESULTS";

export class WebSearchError extends Error {
  public readonly code: WebSearchErrorCode;
  public readonly status?: number;

  public constructor(code: WebSearchErrorCode, message: string, options: { status?: number } = {}) {
    super(message);
    this.name = "WebSearchError";
    this.code = code;
    if (options.status !== undefined) {
      this.status = options.status;
    }
  }
}

export function isWebSearchError(error: unknown): error is WebSearchError {
  return error instanceof WebSearchError;
}
