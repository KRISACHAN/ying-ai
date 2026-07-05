/** Client-safe Web Search availability types and labels (no web-search package import). */

export type WebSearchAvailability =
  | { available: true }
  | {
      available: false;
      reason:
        | "disabled"
        | "missing_api_key"
        | "tool_calling_unsupported"
        | "unsupported_backend"
        | "provider_initialization_failed";
    };

export function formatWebSearchAvailabilityLabel(availability: WebSearchAvailability): string {
  if (availability.available) {
    return "Web Search：可用";
  }

  const labels: Record<Exclude<WebSearchAvailability, { available: true }>["reason"], string> = {
    disabled: "Web Search：未启用（设置 WEB_SEARCH_ENABLED=true）",
    missing_api_key: "Web Search：缺少 TAVILY_API_KEY",
    tool_calling_unsupported: "Web Search：当前模型未开启 toolCalling",
    unsupported_backend: "Web Search：不支持的 WEB_SEARCH_BACKEND",
    provider_initialization_failed: "Web Search：Provider 初始化失败",
  };

  return labels[availability.reason];
}

export function readWebSearchAvailability(metadata: unknown): WebSearchAvailability | null {
  if (typeof metadata !== "object" || metadata === null) {
    return null;
  }

  const availability = (metadata as { webSearchAvailability?: unknown }).webSearchAvailability;

  if (availability === undefined) {
    return null;
  }

  if (availability === null || typeof availability !== "object") {
    return null;
  }

  const record = availability as { available?: unknown; reason?: unknown };

  if (record.available === true) {
    return { available: true };
  }

  if (
    record.available === false &&
    (record.reason === "disabled" ||
      record.reason === "missing_api_key" ||
      record.reason === "tool_calling_unsupported" ||
      record.reason === "unsupported_backend" ||
      record.reason === "provider_initialization_failed")
  ) {
    return { available: false, reason: record.reason };
  }

  return null;
}
