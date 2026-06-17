import {
  createCompanionCore,
  createModel,
  DefaultPersonaProvider,
  InMemorySummaryProvider,
  ModelEmotionEngine,
  ModelRuntimeError,
  type ChatMessage,
  type ChatWorkflowOutput,
  type CoreEvent,
  type CoreObserver,
  type EmotionState,
  type MemoryScope,
  type SummaryOptions,
} from "@ying-companion/ai-core";

import { loadModelConfig } from "../../lib/model-config";
import { resolveChatMemoryRuntime, type MemoryDatabaseStatus } from "../../lib/memory-config";

// demo 级防护：限制单条消息长度与历史条数，避免不可控 token 成本。
const MAX_MESSAGE_LENGTH = 8000;
const MAX_HISTORY_LENGTH = 50;
const DEFAULT_COMPANION_ID = "debug-companion";
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
    // workflow 不显式注入：createCompanionCore 默认即 SimpleChatWorkflow（阶段 3 §7.3）。
    const core = createCompanionCore({
      model,
      observer,
      emotion: new ModelEmotionEngine({ model }),
      memory: memoryRuntime.provider,
      summary: demoSummaryProvider,
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

    const output = await core.executeWorkflow({
      sessionId,
      message: body.message,
      history: body.history ?? [],
      ...(body.emotion !== undefined ? { emotion: normalizeEmotion(body.emotion) } : {}),
      scope,
      conversationId: sessionId,
      summaryOptions,
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

function normalizeEmotion(emotion: EmotionState): EmotionState {
  return {
    current: emotion.current,
    intensity: Math.min(1, Math.max(0, emotion.intensity)),
    ...(emotion.updatedAt !== undefined ? { updatedAt: new Date(emotion.updatedAt) } : {}),
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
