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
import { errorResponse, jsonResponse } from "../../../../lib/http";

const MAX_MESSAGE_LENGTH = 8000;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const repository = new DebugRepository();
  const { id } = await context.params;
  let pending: Awaited<ReturnType<DebugRepository["createPendingRun"]>> | undefined;
  let runtime: ConversationRuntime | undefined;
  let outputGenerated = false;

  try {
    const raw = (await request.json()) as { message?: unknown };
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

    const detail = await repository.getConversationDetail(id);

    if (detail === null) {
      return jsonResponse({ ok: false, error: { message: "conversation not found" } }, 404);
    }

    pending = await repository.createPendingRun({ conversationId: id, message });

    const history = await repository.getCompletedHistory(id);
    runtime = await createConversationRuntime({
      companion: detail.companion,
      conversationId: id,
      emotion: detail.conversation.emotion,
      repository,
    });
    const output = await runtime.core.executeWorkflow({
      sessionId: id,
      message,
      history,
      ...(detail.conversation.emotion !== null ? { emotion: detail.conversation.emotion } : {}),
      scope: runtime.scope,
      summaryScope: {
        ownerType: LOCAL_DEBUG_OWNER.type,
        ownerId: LOCAL_DEBUG_OWNER.id,
        companionId: detail.companion.id,
        conversationId: id,
      },
      conversationId: id,
      messageIds: [pending.userMessage.id],
      summaryOptions: DEFAULT_SUMMARY_OPTIONS,
      workflowOptions: { includeTrace: true },
    });
    const outputWithMeta = attachProviderMetadata(output, runtime);
    const observerEvents = serializeEvents(runtime.observer.events);
    outputGenerated = true;
    const completed = await repository.completeRun({
      conversationId: id,
      runId: pending.run.id,
      userMessageId: pending.userMessage.id,
      output: outputWithMeta,
      observerEvents,
    });

    return jsonResponse({
      ok: true,
      userMessage: { ...pending.userMessage, status: "completed" },
      assistantMessage: completed.assistantMessage,
      conversation: completed.conversation,
      workflowRun: completed.run,
    });
  } catch (error) {
    if (pending !== undefined && !outputGenerated) {
      await repository
        .failRun({
          conversationId: id,
          runId: pending.run.id,
          userMessageId: pending.userMessage.id,
          error: new Error(toSafeRuntimeMessage(error)),
          observerEvents: runtime !== undefined ? serializeEvents(runtime.observer.events) : [],
        })
        .catch(() => {});
    }

    if (pending !== undefined && outputGenerated) {
      const safeMessage = toSafeRuntimeMessage(error);
      await repository
        .markRunPersistenceFailure({
          conversationId: id,
          runId: pending.run.id,
          userMessageId: pending.userMessage.id,
          error: new Error(`persistence failed after model output: ${safeMessage}`),
        })
        .catch(() => {});

      return jsonResponse(
        {
          ok: false,
          error: {
            message: `模型生成成功，但会话持久化失败；该轮刷新后可能丢失。${safeMessage}`,
          },
        },
        500,
      );
    }

    return errorResponse(new Error(toSafeRuntimeMessage(error)), 500);
  }
}
