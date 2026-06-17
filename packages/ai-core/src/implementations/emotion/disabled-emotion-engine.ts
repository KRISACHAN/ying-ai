/**
 * DisabledEmotionEngine — 情绪状态机占位实现。
 */
import type {
  EmotionAnalyzeInput,
  EmotionEngine,
  EmotionState,
  EmotionTransitionInput,
} from "../../abstractions/emotion";

/**
 * 情绪引擎占位实现：始终返回 neutral；transition 直接透传 detected。
 *
 * 默认 disabled 不保证 previous emotion 连续性。需要情绪连续性时，
 * 宿主应显式注入 ModelEmotionEngine 或自定义 EmotionEngine。
 */
export class DisabledEmotionEngine implements EmotionEngine {
  public readonly meta = {
    id: "emotion.disabled",
    kind: "emotion",
    name: "Disabled Emotion Engine",
  } as const;

  /** 固定返回 neutral / intensity 0，避免默认 Core 增加模型调用成本。 */
  public async analyze(input: EmotionAnalyzeInput): Promise<EmotionState> {
    void input;

    return {
      current: "neutral",
      intensity: 0,
    };
  }

  /** 占位实现：直接透传 detected，不做状态转移计算。 */
  public transition(input: EmotionTransitionInput): EmotionState {
    return input.detected;
  }
}
