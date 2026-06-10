import {
  createCompanionCore,
  createModel,
  DefaultPersonaProvider,
  ModelRuntimeError,
  SimpleChatWorkflow,
  type ChatMessage,
  type ChatWorkflowOutput,
  type CoreEvent,
  type CoreObserver,
} from "@ying-companion/ai-core";

import { loadModelConfig } from "../../lib/model-config";

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

export async function POST(request: Request): Promise<Response> {
  const observer = new CollectingObserver();

  try {
    const body = (await request.json()) as ChatRequestBody;

    const config = loadModelConfig(process.env);
    const model = createModel(config);
    const core = createCompanionCore({
      model,
      observer,
      // 仅 demo 默认值：性别可改，不代表产品固定角色（见阶段 2 §八）。
      persona: new DefaultPersonaProvider({
        id: "debug-companion",
        name: "映映",
        gender: "female",
        relationship: "AI 伴侣",
        personality: "温柔、真诚、愿意倾听",
        speakingStyle: "自然、亲近、不过度夸张",
      }),
      workflow: new SimpleChatWorkflow(),
    });

    const output = await core.executeWorkflow({
      sessionId: body.sessionId ?? "demo-session",
      message: body.message,
      history: body.history ?? [],
    });

    return jsonResponse({
      ok: true,
      output,
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

function jsonResponse(body: ChatResponseBody): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
