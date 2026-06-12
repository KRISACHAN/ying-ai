import {
  createCompanionCore,
  createModel,
  DefaultPersonaProvider,
  InMemoryMemoryProvider,
  ModelRuntimeError,
  type ChatMessage,
  type CreateModelOptions,
  type ChatWorkflowOutput,
  type CoreEvent,
  type CoreObserver,
  type MemoryProvider,
} from "@ying-companion/ai-core";
import { OpenAIEmbeddingProvider, PostgresMemoryProvider } from "@ying-companion/memory-postgres";

import { loadModelConfig, readOptionalEnv } from "../../lib/model-config";

// demo 级防护：限制单条消息长度与历史条数，避免不可控 token 成本。
const MAX_MESSAGE_LENGTH = 8000;
const MAX_HISTORY_LENGTH = 50;
const inMemoryDemoMemory = new InMemoryMemoryProvider();
let postgresDemoMemory:
  | {
      key: string;
      provider: PostgresMemoryProvider;
    }
  | undefined;

interface ChatRequestBody {
  message: string;
  history?: ChatMessage[];
  sessionId?: string;
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
    const memory = createDemoMemoryProvider(process.env, config);
    // workflow 不显式注入：createCompanionCore 默认即 SimpleChatWorkflow（阶段 3 §7.3）。
    const core = createCompanionCore({
      model,
      observer,
      memory,
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
      sessionId: body.sessionId ?? "demo-session",
      message: body.message,
      history: body.history ?? [],
      conversationId: body.sessionId ?? "demo-session",
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
        },
      },
      observerEvents: serializeEvents(observer.events),
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: { message: toSafeMessage(error) },
      observerEvents: serializeEvents(observer.events),
    });
  }
}

function createDemoMemoryProvider(
  env: NodeJS.ProcessEnv,
  modelConfig: CreateModelOptions,
): MemoryProvider {
  const connectionString = readOptionalEnv(env, "DATABASE_URL");

  if (connectionString === undefined) {
    return inMemoryDemoMemory;
  }

  const embeddingModel = readOptionalEnv(env, "OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small";
  const tableName = readOptionalEnv(env, "MEMORY_POSTGRES_TABLE");
  const key = [
    connectionString,
    modelConfig.apiKey,
    modelConfig.baseUrl ?? "",
    embeddingModel,
    tableName ?? "",
  ].join("\n");

  if (postgresDemoMemory?.key === key) {
    return postgresDemoMemory.provider;
  }

  const embeddingProvider = new OpenAIEmbeddingProvider({
    apiKey: modelConfig.apiKey,
    model: embeddingModel,
    ...(modelConfig.baseUrl !== undefined ? { baseUrl: modelConfig.baseUrl } : {}),
  });
  const provider = new PostgresMemoryProvider({
    connectionString,
    embeddingProvider,
    ...(tableName !== undefined ? { tableName } : {}),
  });

  postgresDemoMemory = { key, provider };

  return provider;
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
