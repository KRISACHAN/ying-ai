import {
  createCompanionCore,
  createModel,
  DefaultPersonaProvider,
  InMemorySummaryProvider,
  LocalToolRegistry,
  ModelEmotionEngine,
  ModelRuntimeError,
  type ChatMessage,
  type ChatWorkflowOutput,
  type CoreEvent,
  type CoreObserver,
  type EmotionState,
  type MemoryProvider,
  type MemoryScope,
  type SummaryOptions,
} from "@ying-companion/ai-core";

import { loadModelConfig } from "../../lib/model-config";
import { resolveChatMemoryRuntime, type MemoryDatabaseStatus } from "../../lib/memory-config";

// demo 级防护：限制单条消息长度与历史条数，避免不可控 token 成本。
const MAX_MESSAGE_LENGTH = 8000;
const MAX_HISTORY_LENGTH = 50;
const DEFAULT_COMPANION_ID = "debug-companion";
const DEMO_TIME_ZONE = "Asia/Shanghai";
const DEFAULT_SUMMARY_OPTIONS: Required<SummaryOptions> = {
  enabled: false,
  recentMessageLimit: 10,
  summarizeTriggerMessageCount: 14,
};
const demoSummaryProvider = new InMemorySummaryProvider();

interface ChatRequestScope {
  ownerType?: MemoryScope["ownerType"];
  ownerId?: string;
  companionId?: string;
}

interface ChatRequestBody {
  message: string;
  history?: ChatMessage[];
  emotion?: EmotionState;
  sessionId?: string;
  scope?: ChatRequestScope;
  summaryOptions?: SummaryOptions;
  workflowOptions?: {
    timeoutMs?: number;
    includeTrace?: boolean;
  };
}

interface SerializedCoreEvent {
  type: CoreEvent["type"];
  timestamp: string;
  payload?: unknown;
}

interface ChatResponseBody {
  ok: boolean;
  output?: ChatWorkflowOutput;
  observerEvents: SerializedCoreEvent[];
  memoryStatus?: MemoryDatabaseStatus;
  memoryReason?: string;
  error?: { message: string };
}

/**
 * demo 内部「收集型 observer」：把每个 CoreEvent 暂存，请求结束后随响应体回传。
 *
 * 非流式 generate 在服务端一次性执行完毕，事件无法被客户端直接监听，
 * 因此必须在服务端收集后序列化返回（见 03-chat-main-pipeline.md §10.4）。
 */
class CollectingObserver implements CoreObserver {
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

/**
 * 校验客户端请求体；非法返回错误文案，合法返回 null。
 * 防止 message/history 类型非法导致下游 TypeError 或不可控成本。
 */
function validateRequestBody(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) {
    return "请求体必须是 JSON 对象";
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.message !== "string" || body.message.trim() === "") {
    return "message 不能为空，且必须是字符串";
  }
  if (body.message.length > MAX_MESSAGE_LENGTH) {
    return `message 长度不能超过 ${MAX_MESSAGE_LENGTH} 字符`;
  }
  if (body.history !== undefined) {
    if (!Array.isArray(body.history)) {
      return "history 必须是数组";
    }
    if (body.history.length > MAX_HISTORY_LENGTH) {
      return `history 长度不能超过 ${MAX_HISTORY_LENGTH} 条`;
    }
  }
  if (body.sessionId !== undefined && typeof body.sessionId !== "string") {
    return "sessionId 必须是字符串";
  }
  if (body.emotion !== undefined) {
    const emotionError = validateEmotion(body.emotion);
    if (emotionError !== null) {
      return emotionError;
    }
  }
  if (body.scope !== undefined) {
    if (typeof body.scope !== "object" || body.scope === null) {
      return "scope 必须是对象";
    }
    const scope = body.scope as Record<string, unknown>;
    const allowedOwnerTypes = ["anonymous", "user", "session", "custom"];
    if (scope.ownerType !== undefined && !allowedOwnerTypes.includes(scope.ownerType as string)) {
      return "scope.ownerType 非法";
    }
    if (scope.ownerId !== undefined && typeof scope.ownerId !== "string") {
      return "scope.ownerId 必须是字符串";
    }
    if (scope.companionId !== undefined && typeof scope.companionId !== "string") {
      return "scope.companionId 必须是字符串";
    }
  }
  if (body.summaryOptions !== undefined) {
    if (typeof body.summaryOptions !== "object" || body.summaryOptions === null) {
      return "summaryOptions 必须是对象";
    }
    const summaryOptions = body.summaryOptions as Record<string, unknown>;
    if (summaryOptions.enabled !== undefined && typeof summaryOptions.enabled !== "boolean") {
      return "summaryOptions.enabled 必须是布尔值";
    }
    for (const field of ["recentMessageLimit", "summarizeTriggerMessageCount"]) {
      const value = summaryOptions[field];
      if (value !== undefined && (!Number.isInteger(value) || (value as number) < 1)) {
        return `summaryOptions.${field} 必须是正整数`;
      }
    }
    const recentMessageLimit = summaryOptions.recentMessageLimit as number | undefined;
    const summarizeTriggerMessageCount = summaryOptions.summarizeTriggerMessageCount as
      | number
      | undefined;
    if (
      recentMessageLimit !== undefined &&
      summarizeTriggerMessageCount !== undefined &&
      recentMessageLimit >= summarizeTriggerMessageCount
    ) {
      return "summaryOptions.recentMessageLimit 必须小于 summaryOptions.summarizeTriggerMessageCount";
    }
  }
  if (body.workflowOptions !== undefined) {
    if (typeof body.workflowOptions !== "object" || body.workflowOptions === null) {
      return "workflowOptions 必须是对象";
    }
    const workflowOptions = body.workflowOptions as Record<string, unknown>;
    if (
      workflowOptions.includeTrace !== undefined &&
      typeof workflowOptions.includeTrace !== "boolean"
    ) {
      return "workflowOptions.includeTrace 必须是布尔值";
    }
    if (
      workflowOptions.timeoutMs !== undefined &&
      (!Number.isInteger(workflowOptions.timeoutMs) || (workflowOptions.timeoutMs as number) < 1)
    ) {
      return "workflowOptions.timeoutMs 必须是正整数";
    }
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  const observer = new CollectingObserver();

  try {
    const raw: unknown = await request.json();
    const validationError = validateRequestBody(raw);

    if (validationError !== null) {
      return jsonResponse(
        { ok: false, error: { message: validationError }, observerEvents: [] },
        400,
      );
    }

    const body = raw as ChatRequestBody;

    const config = loadModelConfig(process.env);
    const model = createModel(config);
    // patch-0 §8.2 / §11.4：按 health snapshot 严格选择 Postgres / InMemory / Unavailable。
    // chat 热路径不探测 DB，仅读 /api/memory-health 写入的 snapshot。
    const memoryRuntime = await resolveChatMemoryRuntime(process.env);
    // patch-0 §9.2 / §10：宿主显式构造 scope（含 companionId），优先级高于 sessionId。
    const sessionId = body.sessionId ?? "demo-session";
    const scope: MemoryScope = {
      ownerType: body.scope?.ownerType ?? "session",
      ownerId: body.scope?.ownerId ?? sessionId,
      companionId: body.scope?.companionId ?? DEFAULT_COMPANION_ID,
    };
    const summaryOptions: SummaryOptions = {
      ...DEFAULT_SUMMARY_OPTIONS,
      ...(body.summaryOptions ?? {}),
    };
    if (
      summaryOptions.recentMessageLimit !== undefined &&
      summaryOptions.summarizeTriggerMessageCount !== undefined &&
      summaryOptions.recentMessageLimit >= summaryOptions.summarizeTriggerMessageCount
    ) {
      return jsonResponse(
        {
          ok: false,
          error: {
            message:
              "summaryOptions.recentMessageLimit 必须小于 summaryOptions.summarizeTriggerMessageCount",
          },
          observerEvents: serializeEvents(observer.events),
        },
        400,
      );
    }

    const inputEmotion =
      body.emotion !== undefined ? normalizeEmotion(body.emotion) : createNeutralDemoEmotion();
    const tools = createDemoTools({
      memory: memoryRuntime.provider,
      scope,
      fallbackEmotion: inputEmotion,
    });

    // workflow 不显式注入：createCompanionCore 默认即 SimpleChatWorkflow（阶段 3 §7.3）。
    const core = createCompanionCore({
      model,
      observer,
      emotion: new ModelEmotionEngine({ model }),
      memory: memoryRuntime.provider,
      summary: demoSummaryProvider,
      tools,
      // 仅 demo 默认值：性别可改，不代表产品固定角色（见阶段 2 §八）。
      persona: new DefaultPersonaProvider({
        id: "debug-companion",
        name: "映映",
        gender: "female",
        relationship: "AI 伴侣",
        personality: "温柔、真诚、愿意倾听",
        speakingStyle: "自然、亲近、不过度夸张",
      }),
    });

    const output = await core.executeWorkflow({
      sessionId,
      message: body.message,
      history: body.history ?? [],
      ...(body.emotion !== undefined ? { emotion: inputEmotion } : {}),
      scope,
      conversationId: sessionId,
      summaryOptions,
      workflowOptions: {
        includeTrace: body.workflowOptions?.includeTrace ?? true,
        ...(body.workflowOptions?.timeoutMs !== undefined
          ? { timeoutMs: body.workflowOptions.timeoutMs }
          : {}),
      },
    });
    const inspection = core.inspect();

    return jsonResponse({
      ok: true,
      output: {
        ...output,
        metadata: {
          ...output.metadata,
          memoryProvider: inspection.providers.memory,
          memoryExtractor: inspection.providers.memoryExtractor,
          summaryProvider: inspection.providers.summary,
          summaryUpdater: inspection.providers.summaryUpdater,
          emotionProvider: inspection.providers.emotion,
          toolProvider: inspection.providers.tools,
        },
      },
      observerEvents: serializeEvents(observer.events),
      memoryStatus: memoryRuntime.status,
      ...(memoryRuntime.reason !== undefined ? { memoryReason: memoryRuntime.reason } : {}),
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: { message: toSafeMessage(error) },
      observerEvents: serializeEvents(observer.events),
    });
  }
}

function validateEmotion(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) {
    return "emotion 必须是对象";
  }

  const emotion = raw as Record<string, unknown>;
  const allowedTypes = ["neutral", "happy", "sad", "angry", "anxious", "affectionate"];

  if (!allowedTypes.includes(emotion.current as string)) {
    return "emotion.current 非法";
  }
  if (typeof emotion.intensity !== "number" || !Number.isFinite(emotion.intensity)) {
    return "emotion.intensity 必须是数字";
  }
  if (emotion.intensity < 0 || emotion.intensity > 1) {
    return "emotion.intensity 必须在 0 到 1 之间";
  }
  if (
    emotion.updatedAt !== undefined &&
    typeof emotion.updatedAt !== "string" &&
    !(emotion.updatedAt instanceof Date)
  ) {
    return "emotion.updatedAt 必须是 ISO 字符串";
  }

  return null;
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

  return normalizeEmotion(emotion as EmotionState);
}

function normalizeEmotion(emotion: EmotionState): EmotionState {
  return {
    current: emotion.current,
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

function serializeEvents(events: CoreEvent[]): SerializedCoreEvent[] {
  return events.map((event) => ({
    type: event.type,
    timestamp: event.timestamp.toISOString(),
    payload: event.payload,
  }));
}

function toSafeMessage(error: unknown): string {
  if (error instanceof ModelRuntimeError) {
    const detail = error.errors
      .map((item) => `phase: ${item.phase}, model: ${item.model}, attempt: ${item.attempt}`)
      .join("; ");
    return detail ? `${error.message} (${detail})` : error.message;
  }

  return error instanceof Error ? error.message : "聊天调用失败";
}

function jsonResponse(body: ChatResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
