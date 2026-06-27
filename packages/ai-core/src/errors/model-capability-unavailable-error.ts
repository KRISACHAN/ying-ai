import type { ModelCapabilitySkipItem, RequiredModelCapabilities } from "../abstractions/model";

export class ModelCapabilityUnavailableError extends Error {
  public constructor(
    message: string,
    public readonly requiredCapabilities: RequiredModelCapabilities,
    public readonly capabilitySkips: ModelCapabilitySkipItem[],
  ) {
    super(message);
    this.name = "ModelCapabilityUnavailableError";
  }
}
