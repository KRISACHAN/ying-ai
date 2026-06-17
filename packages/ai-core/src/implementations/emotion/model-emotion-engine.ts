import type {
  EmotionAnalyzeInput,
  EmotionEngine,
  EmotionState,
  EmotionTransitionInput,
} from "../../abstractions/emotion";
import type { RecalledMemory } from "../../abstractions/memory";
import type { ChatMessage, ChatModel } from "../../abstractions/model";
import type { CompanionPersona } from "../../abstractions/persona";
import { parseEmotionAnalysis } from "./emotion.schema";
import { createNeutralEmotion, transitionEmotion } from "./transition";

export interface ModelEmotionEngineOptions {
  model: ChatModel;
  defaultEmotion?: EmotionState;
  temperature?: number;
  maxTokens?: number;
  retryCount?: number;
  timeoutMs?: number;
  strict?: boolean;
}

export class ModelEmotionEngine implements EmotionEngine {
  public readonly meta = {
    id: "emotion.model",
    kind: "emotion",
    name: "Model Emotion Engine",
    description:
      "Infer companion emotional response with ChatModel and apply deterministic transition rules.",
    version: "0.1.0",
  } as const;

  private readonly model: ChatModel;
  private readonly defaultEmotion: EmotionState | undefined;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly retryCount: number;
  private readonly timeoutMs: number;
  private readonly strict: boolean;

  public constructor(options: ModelEmotionEngineOptions) {
    this.model = options.model;
    this.defaultEmotion = options.defaultEmotion;
    this.temperature = options.temperature ?? 0;
    this.maxTokens = options.maxTokens ?? 256;
    this.retryCount = options.retryCount ?? 1;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.strict = options.strict ?? false;
  }

  public async analyze(input: EmotionAnalyzeInput): Promise<EmotionState> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        const output = await withTimeout(
          this.model.generate({
            messages: buildAnalysisMessages(input, attempt > 0),
            temperature: this.temperature,
            maxTokens: this.maxTokens,
          }),
          this.timeoutMs,
        );

        return parseEmotionAnalysis(output.text).state;
      } catch (error) {
        lastError = error;
      }
    }

    if (this.strict) {
      throw lastError instanceof Error ? lastError : new Error("Emotion analysis failed");
    }

    return {
      ...fallbackEmotion(input.previous, this.defaultEmotion),
      metadata: {
        failed: true,
        failureReason: toFailureReason(lastError),
      },
    };
  }

  public transition(input: EmotionTransitionInput): EmotionState {
    return transitionEmotion(input);
  }
}

function fallbackEmotion(
  previous: EmotionState | undefined,
  defaultEmotion: EmotionState | undefined,
) {
  return previous ?? defaultEmotion ?? createNeutralEmotion();
}

function buildAnalysisMessages(input: EmotionAnalyzeInput, isRetry: boolean): ChatMessage[] {
  const retryInstruction = isRetry
    ? "\n上一次输出不是合法 JSON 或不符合 schema。请只输出合法 JSON，不要添加解释。"
    : "";

  return [
    {
      role: "system",
      content: [
        "你是一个 AI 伴侣的情绪推断器。",
        "请根据用户本轮消息，判断你作为伴侣此刻对用户应有的情绪反应。",
        "",
        "只能从以下情绪中选择一个：neutral, happy, sad, angry, anxious, affectionate。",
        "",
        "情绪选择原则：",
        "1. 这是「伴侣对用户的情绪」，不是对用户的心理诊断；",
        "2. 用户难过或焦虑时，优先 affectionate / sad / anxious，以陪伴和关切为主；",
        "3. 用户开心时，可用 happy / affectionate；",
        "4. angry 仅在你作为伴侣确实需要表达不满时使用，对用户发火时应极少出现；",
        "5. 可参考 previous 情绪保持连续性，但以本轮消息为主；",
        "6. 会提供近期对话历史、角色设定与相关长期记忆，请结合上下文理解指代。",
        "",
        '请只输出 JSON，格式为：{"emotion":"affectionate","intensity":0.6,"confidence":0.8,"reason":"简短原因"}',
        "要求：不要输出 Markdown；不要输出解释文字；intensity 和 confidence 必须是 0 到 1 的数字；reason 不超过 200 字。",
        retryInstruction,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        formatPersona(input.persona),
        formatPreviousEmotion(input.previous),
        formatHistory(input.history),
        formatRecalledMemories(input.recalledMemories),
        `本轮用户消息：${input.message}`,
      ]
        .filter((line) => line !== "")
        .join("\n\n"),
    },
  ];
}

function formatPersona(persona: CompanionPersona | undefined): string {
  if (persona === undefined) {
    return "";
  }

  return [
    "伴侣角色设定：",
    `名称：${persona.name}`,
    `性别：${persona.gender}`,
    persona.relationship !== undefined ? `关系：${persona.relationship}` : "",
    persona.personality !== undefined ? `性格：${persona.personality}` : "",
    persona.speakingStyle !== undefined ? `说话风格：${persona.speakingStyle}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function formatPreviousEmotion(previous: EmotionState | undefined): string {
  if (previous === undefined) {
    return "上一轮伴侣情绪：neutral / 0";
  }

  return `上一轮伴侣情绪：${previous.current} / ${previous.intensity}`;
}

function formatHistory(history: ChatMessage[] | undefined): string {
  const recentHistory = (history ?? []).slice(-6);

  if (recentHistory.length === 0) {
    return "";
  }

  return [
    "近期对话历史：",
    ...recentHistory.map((message) => `${message.role}: ${message.content}`),
  ].join("\n");
}

function formatRecalledMemories(memories: RecalledMemory[] | undefined): string {
  if (memories === undefined || memories.length === 0) {
    return "";
  }

  return [
    "相关长期记忆：",
    ...memories
      .slice(0, 5)
      .map((memory, index) => `${index + 1}. [${memory.type}] ${memory.content}`),
  ].join("\n");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Emotion analysis timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function toFailureReason(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message.slice(0, 200);
  }

  return "emotion_analysis_failed";
}
