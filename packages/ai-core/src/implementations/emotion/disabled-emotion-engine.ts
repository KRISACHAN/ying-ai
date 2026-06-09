import type {
  EmotionAnalyzeInput,
  EmotionEngine,
  EmotionState,
  EmotionTransitionInput,
} from "../../abstractions/emotion";

export class DisabledEmotionEngine implements EmotionEngine {
  public readonly meta = {
    id: "emotion.disabled",
    kind: "emotion",
    name: "Disabled Emotion Engine",
  } as const;

  public async analyze(input: EmotionAnalyzeInput): Promise<EmotionState> {
    void input;

    return {
      current: "neutral",
      intensity: 0,
    };
  }

  public async transition(input: EmotionTransitionInput): Promise<EmotionState> {
    return input.detected;
  }
}
