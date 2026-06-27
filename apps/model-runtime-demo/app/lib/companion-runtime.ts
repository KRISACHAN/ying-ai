import {
  createCompanionCore,
  DefaultPersonaProvider,
  LocalToolRegistry,
  ModelEmotionEngine,
  ModelCapabilityUnavailableError,
  ModelRuntimeError,
  type ChatWorkflowOutput,
  type CoreEvent,
  type CoreObserver,
  type EmotionState,
  type MemoryProvider,
  type MemoryScope,
  type SummaryOptions,
} from "@ying-companion/ai-core";

import { LOCAL_DEBUG_OWNER } from "./debug-owner";
import { DebugRepository, PostgresDebugSummaryProvider } from "./debug-repository";
import type { DebugCompanion, SerializedCoreEvent } from "./debug-types";
import { createConfiguredModel } from "./model-factory";
import { loadModelConfig } from "./model-config";
import { resolveChatMemoryRuntime, type MemoryRuntime } from "./memory-config";

export const DEFAULT_SUMMARY_OPTIONS: Required<SummaryOptions> = {
  enabled: false,
  recentMessageLimit: 10,
  summarizeTriggerMessageCount: 14,
};

const DEMO_TIME_ZONE = "Asia/Shanghai";

export class CollectingObserver implements CoreObserver {
  public readonly meta = {
    id: "observer.demo-collecting",
    kind: "observer",
    name: "Demo Collecting Observer",
  } as const;

  public readonly events: CoreEvent[] = [];

  public emit(event: CoreEvent): void {
    this.events.push(event);
  }
}

export interface ConversationRuntime {
  core: ReturnType<typeof createCompanionCore>;
  observer: CollectingObserver;
  memoryRuntime: MemoryRuntime;
  scope: MemoryScope;
}

export async function createConversationRuntime(input: {
  companion: DebugCompanion;
  conversationId: string;
  emotion: EmotionState | null;
  repository?: DebugRepository;
}): Promise<ConversationRuntime> {
  const observer = new CollectingObserver();
  const config = loadModelConfig(process.env);
  const model = createConfiguredModel(config);
  const memoryRuntime = await resolveChatMemoryRuntime(process.env);
  const repository = input.repository ?? new DebugRepository();
  const scope: MemoryScope = {
    ownerType: LOCAL_DEBUG_OWNER.type,
    ownerId: LOCAL_DEBUG_OWNER.id,
    companionId: input.companion.id,
  };
  const tools = createDemoTools({
    memory: memoryRuntime.provider,
    scope,
    fallbackEmotion: input.emotion ?? createNeutralDemoEmotion(),
  });
  const systemPrompt = input.companion.customInstructions.trim();
  const core = createCompanionCore({
    model,
    observer,
    emotion: new ModelEmotionEngine({ model }),
    memory: memoryRuntime.provider,
    summary: new PostgresDebugSummaryProvider(repository),
    tools,
    persona: new DefaultPersonaProvider({
      id: input.companion.id,
      name: input.companion.name,
      gender: input.companion.gender,
      relationship: input.companion.relationship,
      userDisplayName: input.companion.userDisplayName,
      userAddress: input.companion.userAddress,
      profile: input.companion.profile,
      appearance: input.companion.appearance,
      personality: input.companion.personality,
      speakingStyle: input.companion.speakingStyle,
      background: input.companion.background,
      ...(systemPrompt !== "" ? { systemPrompt } : {}),
    }),
  });

  return {
    core,
    observer,
    memoryRuntime,
    scope,
  };
}

export function serializeEvents(events: CoreEvent[]): SerializedCoreEvent[] {
  return events.map((event) => ({
    type: event.type,
    timestamp: event.timestamp.toISOString(),
    payload: event.payload,
  }));
}

export function attachProviderMetadata(
  output: ChatWorkflowOutput,
  runtime: ConversationRuntime,
): ChatWorkflowOutput {
  const inspection = runtime.core.inspect();

  return {
    ...output,
    metadata: {
      ...output.metadata,
      memoryProvider: inspection.providers.memory,
      memoryExtractor: inspection.providers.memoryExtractor,
      summaryProvider: inspection.providers.summary,
      summaryUpdater: inspection.providers.summaryUpdater,
      emotionProvider: inspection.providers.emotion,
      toolProvider: inspection.providers.tools,
      memoryStatus: runtime.memoryRuntime.status,
      ...(runtime.memoryRuntime.reason !== undefined
        ? { memoryReason: runtime.memoryRuntime.reason }
        : {}),
    },
  };
}

export function toSafeRuntimeMessage(error: unknown): string {
  if (error instanceof ModelCapabilityUnavailableError) {
    const detail = error.capabilitySkips
      .map((item) => `${item.profile.provider}/${item.profile.model}`)
      .join("; ");

    return detail ? `${error.message} (${detail})` : error.message;
  }

  if (error instanceof ModelRuntimeError) {
    const detail = error.errors
      .map((item) => `phase: ${item.phase}, model: ${item.model}, attempt: ${item.attempt}`)
      .join("; ");

    return detail ? `${error.message} (${detail})` : error.message;
  }

  return error instanceof Error ? error.message : "聊天调用失败";
}

function createDemoTools(options: {
  memory: MemoryProvider;
  scope: MemoryScope;
  fallbackEmotion: EmotionState;
}): LocalToolRegistry {
  const tools = new LocalToolRegistry();

  tools.register(
    {
      name: "get_current_time",
      description: "获取当前本地时间。适合用户询问现在几点、今天日期、当前时间时调用。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      metadata: { tags: ["debug", "time"] },
    },
    async (input) => ({
      name: "get_current_time",
      ...(input.call.id !== undefined ? { toolCallId: input.call.id } : {}),
      ok: true,
      result: createCurrentTimeResult(),
    }),
  );

  tools.register(
    {
      name: "search_memory",
      description: "搜索与用户问题相关的长期记忆。适合需要确认用户偏好、事实、过往事件时调用。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "要搜索的记忆查询文本",
          },
          topK: {
            type: "number",
            description: "最多返回多少条记忆",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
      metadata: { tags: ["debug", "memory"] },
    },
    async (input) => {
      const args = toRecord(input.call.arguments);
      const query = typeof args.query === "string" ? args.query : "";
      const topK = typeof args.topK === "number" && Number.isFinite(args.topK) ? args.topK : 3;

      if (query.trim() === "") {
        return {
          name: "search_memory",
          ...(input.call.id !== undefined ? { toolCallId: input.call.id } : {}),
          ok: false,
          result: null,
          error: {
            code: "TOOL_INVALID_ARGUMENTS",
            message: "search_memory.query is required",
          },
        };
      }

      const recalled = await options.memory.recall({
        scope: options.scope,
        query,
        limit: Math.max(1, Math.min(8, Math.floor(topK))),
        minImportance: 1,
      });

      return {
        name: "search_memory",
        ...(input.call.id !== undefined ? { toolCallId: input.call.id } : {}),
        ok: true,
        result: {
          memories: recalled.memories.map((memory) => ({
            id: memory.id,
            type: memory.type,
            content: memory.content,
            importance: memory.importance,
            score: memory.score,
          })),
          embeddingVectorLength: recalled.embeddingVectorLength,
        },
      };
    },
  );

  tools.register(
    {
      name: "get_emotion_state",
      description: "获取当前伴侣情绪状态。适合需要确认伴侣当前情绪时调用。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      metadata: { tags: ["debug", "emotion"] },
    },
    async (input) => ({
      name: "get_emotion_state",
      ...(input.call.id !== undefined ? { toolCallId: input.call.id } : {}),
      ok: true,
      result: readCurrentEmotion(input.metadata) ?? options.fallbackEmotion,
    }),
  );

  return tools;
}

function createCurrentTimeResult(now = new Date()): {
  timezone: string;
  timezoneLabel: string;
  utcOffset: string;
  localTime: string;
  utcIso: string;
  instruction: string;
} {
  return {
    timezone: DEMO_TIME_ZONE,
    timezoneLabel: "北京时间",
    utcOffset: "+08:00",
    localTime: formatDateTimeInTimeZone(now, DEMO_TIME_ZONE),
    utcIso: now.toISOString(),
    instruction: "回答北京时间时使用 localTime，不要把 utcIso 当作北京时间。",
  };
}

function formatDateTimeInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  return [
    `${getDatePart(parts, "year")}-${getDatePart(parts, "month")}-${getDatePart(parts, "day")}`,
    `${getDatePart(parts, "hour")}:${getDatePart(parts, "minute")}:${getDatePart(parts, "second")}`,
  ].join(" ");
}

function getDatePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readCurrentEmotion(metadata: Record<string, unknown> | undefined): EmotionState | null {
  const raw = metadata?.currentEmotion;

  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const emotion = raw as Partial<EmotionState>;
  const allowedTypes = ["neutral", "happy", "sad", "angry", "anxious", "affectionate"];

  if (!allowedTypes.includes(emotion.current as string)) {
    return null;
  }
  if (typeof emotion.intensity !== "number" || !Number.isFinite(emotion.intensity)) {
    return null;
  }

  return {
    current: emotion.current as EmotionState["current"],
    intensity: Math.min(1, Math.max(0, emotion.intensity)),
    ...(emotion.updatedAt !== undefined ? { updatedAt: new Date(emotion.updatedAt) } : {}),
  };
}

function createNeutralDemoEmotion(): EmotionState {
  return {
    current: "neutral",
    intensity: 0,
    updatedAt: new Date(),
  };
}
