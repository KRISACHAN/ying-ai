/**
 * PassthroughSafetyProvider — 安全检测透传实现。
 */
import type {
  SafetyCheckInput,
  SafetyCheckResult,
  SafetyProvider,
} from "../../abstractions/safety";

/** 安全检测透传实现：输入/输出一律放行，供开发与未接入安全策略时使用。 */
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
