import type { CoreProvider } from "./provider";

export type EmotionType = "neutral" | "happy" | "sad" | "angry" | "anxious" | "affectionate";

export interface EmotionState {
  current: EmotionType;
  intensity: number;
  updatedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface EmotionAnalyzeInput {
  sessionId?: string;
  message: string;
  previous?: EmotionState;
  metadata?: Record<string, unknown>;
}

export interface EmotionTransitionInput {
  previous: EmotionState;
  detected: EmotionState;
  metadata?: Record<string, unknown>;
}

export interface EmotionEngine extends CoreProvider {
  analyze(input: EmotionAnalyzeInput): Promise<EmotionState>;
  transition(input: EmotionTransitionInput): Promise<EmotionState>;
}
