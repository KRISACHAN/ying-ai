/**
 * 情绪状态机抽象（阶段 5 接入 Workflow）。
 *
 * EmotionEngine 负责 analyze（识别当前消息情绪）与 transition（基于历史做状态转移）。
 * 当前默认实现为 DisabledEmotionEngine，Workflow 尚未调用此插槽。
 */
import type { CoreProvider } from "./provider";

/** 伴侣当前情绪类型（阶段 5 完整接入）。 */
export type EmotionType = "neutral" | "happy" | "sad" | "angry" | "anxious" | "affectionate";

/** 情绪状态快照，含类型与强度 0–1。 */
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

/** 情绪识别契约（阶段 5 接入 Workflow）。 */
export interface EmotionEngine extends CoreProvider {
  analyze(input: EmotionAnalyzeInput): Promise<EmotionState>;
  transition(input: EmotionTransitionInput): Promise<EmotionState>;
}
