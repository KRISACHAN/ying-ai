/**
 * DisabledEmotionEngine — 情绪状态机占位实现（阶段 5 前）。
 */
import type {
  EmotionAnalyzeInput,
  EmotionEngine,
  EmotionState,
  EmotionTransitionInput,
} from "../../abstractions/emotion";

/** 情绪引擎占位实现（阶段 5 前始终返回 neutral）；transition 直接透传 detected。 */
export class DisabledEmotionEngine implements EmotionEngine {
  public readonly meta = {
    id: "emotion.disabled",
    kind: "emotion",
    name: "Disabled Emotion Engine",
  } as const;

  /** 阶段 5 前固定返回 neutral / intensity 0。 */
  public async analyze(input: EmotionAnalyzeInput): Promise<EmotionState> {
    void input;

    return {
      current: "neutral",
      intensity: 0,
    };
  }

  /** 占位实现：直接透传 detected，不做状态转移计算。 */
  public async transition(input: EmotionTransitionInput): Promise<EmotionState> {
    return input.detected;
  }
}
