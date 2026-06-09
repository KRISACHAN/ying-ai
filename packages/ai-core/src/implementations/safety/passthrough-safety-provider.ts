import type {
  SafetyCheckInput,
  SafetyCheckResult,
  SafetyProvider,
} from "../../abstractions/safety";

export class PassthroughSafetyProvider implements SafetyProvider {
  public readonly meta = {
    id: "safety.passthrough",
    kind: "safety",
    name: "Passthrough Safety Provider",
  } as const;

  public async guardInput(input: SafetyCheckInput): Promise<SafetyCheckResult> {
    void input;

    return {
      allowed: true,
    };
  }

  public async guardOutput(input: SafetyCheckInput): Promise<SafetyCheckResult> {
    void input;

    return {
      allowed: true,
    };
  }
}
