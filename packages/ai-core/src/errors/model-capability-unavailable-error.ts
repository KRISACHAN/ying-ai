import type { ModelCapabilitySkipItem, RequiredModelCapabilities } from "../abstractions/model";

/** 所有候选模型均不满足本次 requiredCapabilities 时的结构化错误。 */
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
