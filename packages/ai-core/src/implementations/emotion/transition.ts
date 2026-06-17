import type {
  EmotionState,
  EmotionTransitionInput,
  EmotionTransitionRule,
  EmotionType,
} from "../../abstractions/emotion";
import { clamp01 } from "./emotion.schema";

const EMOTION_TYPES = new Set<EmotionType>([
  "neutral",
  "happy",
  "sad",
  "angry",
  "anxious",
  "affectionate",
]);

export function transitionEmotion(input: EmotionTransitionInput): EmotionState {
  const now = input.now ?? new Date();
  const previous = normalizeEmotion(input.previous, now);
  const detected = normalizeEmotion(input.detected, now);

  if (previous === undefined || detected === undefined) {
    return buildEmotion("neutral", 0, now, "fallback");
  }

  if (detected.intensity >= 0.8) {
    return buildEmotion(detected.current, detected.intensity, now, "strong_override");
  }

  if (detected.current === "neutral") {
    const decayedIntensity = clamp01(previous.intensity * 0.7);

    if (decayedIntensity < 0.2) {
      return buildEmotion("neutral", 0, now, "neutral_decay");
    }

    return buildEmotion(previous.current, decayedIntensity, now, "neutral_decay");
  }

  if (previous.current === detected.current) {
    return buildEmotion(
      detected.current,
      clamp01(previous.intensity * 0.6 + detected.intensity * 0.6),
      now,
      "same_emotion_boost",
    );
  }

  return buildEmotion(
    detected.current,
    clamp01(detected.intensity * 0.75 + previous.intensity * 0.25),
    now,
    "switch",
  );
}

export function createNeutralEmotion(now = new Date()): EmotionState {
  return {
    current: "neutral",
    intensity: 0,
    updatedAt: now,
  };
}

function normalizeEmotion(emotion: EmotionState, now: Date): EmotionState | undefined {
  if (!EMOTION_TYPES.has(emotion.current) || !Number.isFinite(emotion.intensity)) {
    return undefined;
  }

  return {
    current: emotion.current,
    intensity: clamp01(emotion.intensity),
    updatedAt: emotion.updatedAt ?? now,
    ...(emotion.metadata !== undefined ? { metadata: emotion.metadata } : {}),
  };
}

function buildEmotion(
  current: EmotionType,
  intensity: number,
  updatedAt: Date,
  transitionRule: EmotionTransitionRule,
): EmotionState {
  return {
    current,
    intensity: clamp01(intensity),
    updatedAt,
    metadata: { transitionRule },
  };
}
