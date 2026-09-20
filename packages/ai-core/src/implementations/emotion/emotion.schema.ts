/**
 * 模型情绪分析输出的解析与数值归一化边界。
 *
 * 允许从带少量外围文本的响应中提取首尾 JSON 对象，但最终字段仍必须通过 Zod schema；
 * intensity/confidence 统一收敛到 0–1，reason 只作为有限长度调试信息。
 */
import { z } from "zod";

import type { EmotionDebugMetadata, EmotionState, EmotionType } from "../../abstractions/emotion";

const EMOTION_TYPES = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "anxious",
  "affectionate",
] as const satisfies readonly EmotionType[];

/** 模型必须返回的结构化情绪形状；不包含状态转移结果。 */
export const emotionAnalysisSchema = z.object({
  emotion: z.enum(EMOTION_TYPES),
  intensity: z.number(),
  confidence: z.number().optional(),
  reason: z.string().max(200).optional(),
});

export interface ParsedEmotionAnalysis {
  state: EmotionState;
}

/** 将模型文本解析为“本轮检测情绪”，后续连续性规则由 transitionEmotion 负责。 */
export function parseEmotionAnalysis(text: string, now = new Date()): ParsedEmotionAnalysis {
  const json = parseJsonObject(text);
  const parsed = emotionAnalysisSchema.parse(json);
  const metadata = buildMetadata(parsed.confidence, parsed.reason);

  return {
    state: {
      current: parsed.emotion,
      intensity: clamp01(parsed.intensity),
      updatedAt: now,
      ...(metadata !== undefined ? { metadata } : {}),
    },
  };
}

/** 将非有限值回退为 0，其余值限制到闭区间 0–1。 */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function buildMetadata(
  confidence: number | undefined,
  reason: string | undefined,
): EmotionDebugMetadata | undefined {
  const metadata: EmotionDebugMetadata = {};

  if (confidence !== undefined && Number.isFinite(confidence)) {
    metadata.confidence = clamp01(confidence);
  }

  const trimmedReason = reason?.trim();
  if (trimmedReason !== undefined && trimmedReason !== "") {
    metadata.reason = trimmedReason.slice(0, 200);
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start < 0 || end <= start) {
      throw new Error("Emotion analysis output is not JSON");
    }

    return JSON.parse(trimmed.slice(start, end + 1));
  }
}
