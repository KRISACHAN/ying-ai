import {
  createStoryErrorWireEvent,
  toStoryWorkflowStreamWireEvent,
  type SerializableStoryWorkflowOutput,
} from "../../../../lib/story-stream-wire";
import { encodeStoryNdjson } from "../../../../lib/story-stream-transport";
import { getStoryWorkflowRuntime } from "../../../../lib/story-runtime-factory";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { message?: unknown; clientTurnId?: unknown };
  try {
    body = (await request.json()) as { message?: unknown; clientTurnId?: unknown };
  } catch {
    return jsonError("invalid_request", "Request body must be JSON.", 400);
  }

  if (typeof body.message !== "string" || body.message.trim() === "") {
    return jsonError("invalid_request", "message is required.", 400);
  }
  if (typeof body.clientTurnId !== "string" || body.clientTurnId.trim() === "") {
    return jsonError("invalid_request", "clientTurnId is required.", 400);
  }

  const message = body.message.trim();
  const clientTurnId = body.clientTurnId.trim();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let output: SerializableStoryWorkflowOutput | undefined;
      let terminalSent = false;
      let text = "";
      let turnId: string | undefined;
      let stateRevision: number | undefined;

      try {
        const runtime = await getStoryWorkflowRuntime();
        for await (const event of runtime.workflow.stream({
          sessionId: id,
          clientTurnId,
          userInput: message,
          signal: request.signal,
        })) {
          if (event.type === "story:text-delta") {
            text += event.delta;
          }
          if (event.type === "story:committed") {
            turnId = event.turnId;
            stateRevision = event.stateRevision;
          }
          if (event.type === "story:summary-updated") {
            output = {
              sessionId: id,
              clientTurnId,
              text,
              ...(turnId ? { turnId } : {}),
              ...(stateRevision !== undefined ? { stateRevision } : {}),
              summaryStatus: event.status,
            };
          }
          if (event.type === "story:finish") {
            terminalSent = true;
            controller.enqueue(
              encodeStoryNdjson(
                toStoryWorkflowStreamWireEvent(
                  event,
                  output ?? {
                    sessionId: id,
                    clientTurnId,
                    text,
                    ...(turnId ? { turnId } : {}),
                    ...(stateRevision !== undefined ? { stateRevision } : {}),
                  },
                ),
              ),
            );
            continue;
          }
          if (event.type === "story:error") {
            terminalSent = true;
          }
          controller.enqueue(encodeStoryNdjson(toStoryWorkflowStreamWireEvent(event)));
        }
      } catch (error) {
        if (!terminalSent) {
          terminalSent = true;
          controller.enqueue(
            encodeStoryNdjson(
              createStoryErrorWireEvent({
                workflowId: `story_route_${crypto.randomUUID()}`,
                sessionId: id,
                clientTurnId,
                code: errorCode(error),
                message: error instanceof Error ? error.message : "Story workflow failed.",
              }),
            ),
          );
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function jsonError(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "STORY_WORKFLOW_FAILED";
}
