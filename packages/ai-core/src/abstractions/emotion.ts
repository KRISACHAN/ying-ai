/**
 * 情绪状态机抽象（阶段 5）。
 *
 * EmotionState 始终表示「伴侣对用户的情绪状态」，不是对用户的心理诊断。
 * analyze 输出伴侣面对本轮消息时的意向情绪，transition 合并上轮状态得到最终状态。
 */
import type { RecalledMemory } from "./memory";
import type { ChatMessage } from "./model";
import type { CompanionPersona } from "./persona";
import type { CoreProvider } from "./provider";

/** 伴侣当前情绪类型（阶段 5 完整接入）。 */
export type EmotionType = "neutral" | "happy" | "sad" | "angry" | "anxious" | "affectionate";

export type EmotionTransitionRule =
  | "fallback"
  | "strong_override"
  | "neutral_decay"
  | "same_emotion_boost"
  | "switch";

/** 仅用于调试与 Observer，不作为持久化或业务 API 的稳定字段。 */
export interface EmotionDebugMetadata {
  confidence?: number;
  reason?: string;
  transitionRule?: EmotionTransitionRule;
  failed?: boolean;
  failureReason?: string;
}

/** 情绪状态快照，含类型与强度 0–1。 */
export interface EmotionState {
  current: EmotionType;
  intensity: number;
  updatedAt?: Date;
  metadata?: EmotionDebugMetadata;
}

export interface EmotionAnalyzeInput {
  sessionId?: string;
  message: string;
  /** 短期历史（不含本轮 message）。 */
  history?: ChatMessage[];
  /** 已加载的 Persona；Workflow 在 persona.load 之后传入。 */
  persona?: CompanionPersona;
  /** 本轮 recall 结果；无召回时可省略或传空数组。 */
  recalledMemories?: RecalledMemory[];
  previous?: EmotionState;
}

export interface EmotionTransitionInput {
  previous: EmotionState;
  detected: EmotionState;
  /** 状态更新时间；默认 new Date()。 */
  now?: Date;
}

/** 情绪识别与转移契约。 */
export interface EmotionEngine extends CoreProvider {
  analyze(input: EmotionAnalyzeInput): Promise<EmotionState>;
  transition(input: EmotionTransitionInput): EmotionState;
}
