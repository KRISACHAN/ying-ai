import type { ChatWorkflowOutput } from "@ying-companion/ai-core";

import {
  attachProviderMetadata,
  type ConversationRuntime,
  createConversationRuntime,
  DEFAULT_SUMMARY_OPTIONS,
  serializeEvents,
  toSafeRuntimeMessage,
} from "../../../../lib/companion-runtime";
import { DebugRepository } from "../../../../lib/debug-repository";
import { LOCAL_DEBUG_OWNER } from "../../../../lib/debug-owner";
import { encodeNdjson } from "../../../../lib/chat-stream-transport";
import {
  createWorkflowErrorWireEvent,
  toChatWorkflowStreamWireEvent,
  type ChatWorkflowStreamWireEvent,
} from "../../../../lib/chat-stream-wire";
import { jsonResponse } from "../../../../lib/http";
import { validateDebugModelConfig } from "../../../../lib/model-config";

const MAX_MESSAGE_LENGTH = 8000;

interface ConversationMessageRequestBody {
  message?: unknown;
  modelConfig?: unknown;
  apiKeyOverride?: unknown;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const repository = new DebugRepository();
  const { id } = await context.params;
  let raw: ConversationMessageRequestBody;

  try {
    raw = (await request.json()) as ConversationMessageRequestBody;
  } catch {
    return jsonResponse({ ok: false, error: { message: "invalid JSON body" } }, 400);
  }

  const message = typeof raw.message === "string" ? raw.message.trim() : "";

  if (message === "") {
    return jsonResponse({ ok: false, error: { message: "message is required" } }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(
      { ok: false, error: { message: `message length must be <= ${MAX_MESSAGE_LENGTH}` } },
      400,
    );
  }

  let modelConfig: ReturnType<typeof validateDebugModelConfig> | undefined;

  try {
    if (raw.modelConfig !== undefined) {
      modelConfig = validateDebugModelConfig(raw.modelConfig);
    }
  } catch (error) {
    return jsonResponse({ ok: false, error: { message: toSafeRuntimeMessage(error) } }, 400);
  }

  const detail = await repository.getConversationDetail(id);

  if (detail === null) {
    return jsonResponse({ ok: false, error: { message: "conversation not found" } }, 404);
  }

  let pending: Awaited<ReturnType<DebugRepository["createPendingRun"]>> | undefined;
  let history: Awaited<ReturnType<DebugRepository["getCompletedHistory"]>>;
  let runtime: ConversationRuntime;

  try {
    pending = await repository.createPendingRun({ conversationId: id, message });
    history = await repository.getCompletedHistory(id);
    runtime = await createConversationRuntime({
      companion: detail.companion,
      conversationId: id,
      emotion: detail.conversation.emotion,
      repository,
      ...(modelConfig !== undefined ? { modelConfig } : {}),
      ...(typeof raw.apiKeyOverride === "string" && raw.apiKeyOverride.trim() !== ""
        ? { apiKeyOverride: raw.apiKeyOverride }
        : {}),
    });
  } catch (error) {
    if (pending !== undefined) {
      const safeMessage = toSafeRuntimeMessage(error);

      await repository
        .failRun({
          conversationId: id,
          runId: pending.run.id,
          userMessageId: pending.userMessage.id,
          error: new Error(safeMessage),
          observerEvents: [],
        })
        .catch(() => {});
    }

    return jsonResponse({ ok: false, error: { message: toSafeRuntimeMessage(error) } }, 500);
  }

  if (pending === undefined) {
    return jsonResponse({ ok: false, error: { message: "failed to create pending run" } }, 500);
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void streamConversation({
        controller,
        repository,
        conversationId: id,
        message,
        pending,
        history,
        runtime,
        detail,
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function streamConversation(input: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  repository: DebugRepository;
  conversationId: string;
  message: string;
  pending: Awaited<ReturnType<DebugRepository["createPendingRun"]>>;
  history: Awaited<ReturnType<DebugRepository["getCompletedHistory"]>>;
  runtime: ConversationRuntime;
  detail: NonNullable<Awaited<ReturnType<DebugRepository["getConversationDetail"]>>>;
}): Promise<void> {
  let workflowId = `host-${input.pending.run.id}`;
  let finishEvent: ChatWorkflowStreamWireEvent | null = null;
  let generatedOutput: ChatWorkflowOutput | null = null;
  let terminalSent = false;
  let partialOutputText = "";

  try {
    for await (const event of input.runtime.core.streamWorkflow({
      sessionId: input.conversationId,
      message: input.message,
      history: input.history,
      ...(input.detail.conversation.emotion !== null
        ? { emotion: input.detail.conversation.emotion }
        : {}),
      scope: input.runtime.scope,
      summaryScope: {
        ownerType: LOCAL_DEBUG_OWNER.type,
        ownerId: LOCAL_DEBUG_OWNER.id,
        companionId: input.detail.companion.id,
        conversationId: input.conversationId,
      },
      conversationId: input.conversationId,
      messageIds: [input.pending.userMessage.id],
      summaryOptions: DEFAULT_SUMMARY_OPTIONS,
      workflowOptions: { includeTrace: true },
    })) {
      workflowId = event.workflowId;

      if (event.type === "workflow:finish") {
        generatedOutput = attachProviderMetadata(event.output, input.runtime);
        finishEvent = toChatWorkflowStreamWireEvent({
          ...event,
          output: generatedOutput,
        });
        continue;
      }

      const wireEvent = toChatWorkflowStreamWireEvent(event);

      if (event.type === "text:delta") {
        partialOutputText += event.text;
      }

      if (event.type === "workflow:error") {
        await input.repository.failRun({
          conversationId: input.conversationId,
          runId: input.pending.run.id,
          userMessageId: input.pending.userMessage.id,
          error: new Error(event.error.message),
          observerEvents: serializeEvents(input.runtime.observer.events),
          ...(partialOutputText !== "" ? { partialOutputText } : {}),
        });
        enqueue(input.controller, wireEvent);
        terminalSent = true;
        return;
      }

      enqueue(input.controller, wireEvent);
    }

    if (generatedOutput === null || finishEvent === null) {
      throw new Error("Core stream ended without workflow:finish or workflow:error.");
    }

    try {
      await input.repository.completeRun({
        conversationId: input.conversationId,
        runId: input.pending.run.id,
        userMessageId: input.pending.userMessage.id,
        output: generatedOutput,
        observerEvents: serializeEvents(input.runtime.observer.events),
      });
    } catch (error) {
      const safeMessage = toSafeRuntimeMessage(error);

      try {
        await input.repository.markRunPersistenceFailure({
          conversationId: input.conversationId,
          runId: input.pending.run.id,
          userMessageId: input.pending.userMessage.id,
          output: generatedOutput,
          observerEvents: serializeEvents(input.runtime.observer.events),
          error: new Error(`persistence failed after model output: ${safeMessage}`),
        });
      } catch {
        // The browser contract must still expose the original persistence failure semantics.
      }

      enqueue(
        input.controller,
        createWorkflowErrorWireEvent({
          workflowId,
          code: "workflow_failed",
          message: "模型回复已生成，但会话持久化失败；刷新后可能丢失",
          details: { reason: "persistence_failed" },
        }),
      );
      terminalSent = true;
      return;
    }

    enqueue(input.controller, finishEvent);
    terminalSent = true;
  } catch (error) {
    const safeMessage = toSafeRuntimeMessage(error);

    try {
      await input.repository.failRun({
        conversationId: input.conversationId,
        runId: input.pending.run.id,
        userMessageId: input.pending.userMessage.id,
        error: new Error(safeMessage),
        observerEvents: serializeEvents(input.runtime.observer.events),
        ...(partialOutputText !== "" ? { partialOutputText } : {}),
      });
    } catch {
      // The stream is already established; expose the original failure to the browser.
    }

    if (!terminalSent) {
      enqueue(
        input.controller,
        createWorkflowErrorWireEvent({
          workflowId,
          code: "workflow_failed",
          message: safeMessage,
          details: { reason: "route_internal_failed" },
        }),
      );
    }
  } finally {
    input.controller.close();
  }
}

function enqueue(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: ChatWorkflowStreamWireEvent,
): void {
  controller.enqueue(encodeNdjson(event));
}
