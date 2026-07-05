export class WebSearchProviderError extends Error {
  public readonly code: string;
  public readonly providerId?: string;
  public readonly status?: number;

  public constructor(
    message: string,
    options: { code: string; providerId?: string; status?: number },
  ) {
    super(message);
    this.name = "WebSearchProviderError";
    this.code = options.code;
    if (options.providerId !== undefined) {
      this.providerId = options.providerId;
    }
    if (options.status !== undefined) {
      this.status = options.status;
    }
  }
}

export function readProviderErrorCode(error: unknown): string {
  if (error instanceof WebSearchProviderError) {
    return error.code;
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim() !== "") {
      return code;
    }
  }

  return "request_failed";
}
