import { WebSearchProviderError } from "@ying-ai/tool-web-search";

export type TavilyErrorCode =
  | "authentication_failed"
  | "rate_limited"
  | "timeout"
  | "service_unavailable"
  | "request_failed";

export class TavilyWebSearchError extends WebSearchProviderError {
  declare public readonly code: TavilyErrorCode;

  public constructor(message: string, options: { code: TavilyErrorCode; status?: number }) {
    super(message, {
      code: options.code,
      providerId: "tavily",
      ...(options.status !== undefined ? { status: options.status } : {}),
    });
    this.name = "TavilyWebSearchError";
  }
}
