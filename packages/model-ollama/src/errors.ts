export class OllamaAdapterError extends Error {
  public constructor(
    public readonly code: "configuration_error" | "message_mapping_failed" | "tool_mapping_failed",
    message: string,
  ) {
    super(message);
    this.name = "OllamaAdapterError";
  }
}
