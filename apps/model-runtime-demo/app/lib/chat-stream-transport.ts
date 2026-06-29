import type { ChatWorkflowStreamWireEvent, JsonValue, SafeErrorDetails } from "./chat-stream-wire";

const encoder = new TextEncoder();
const TERMINAL_EVENT_TYPES = new Set(["workflow:finish", "workflow:error"]);
const WORKFLOW_STEP_STATUSES = new Set(["success", "skipped", "failed", "degraded"]);
const SAFE_ERROR_CODES = new Set([
  "workflow_stream_not_supported",
  "input_safety_rejected",
  "output_safety_rejected",
  "model_stream_failed",
  "tool_planning_failed",
  "tool_execution_failed",
  "post_process_failed",
  "workflow_failed",
]);

export class ChatStreamProtocolError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ChatStreamProtocolError";
  }
}

export function encodeNdjson(event: ChatWorkflowStreamWireEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

export async function* parseNdjsonWireEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<ChatWorkflowStreamWireEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pendingBuffer = "";
  let terminalReceived = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        pendingBuffer += decoder.decode();
        break;
      }

      pendingBuffer += decoder.decode(value, { stream: true });
      const lines = pendingBuffer.split("\n");
      pendingBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseWireEventLine(line);

        if (event === null) {
          continue;
        }
        if (terminalReceived) {
          throw new ChatStreamProtocolError("Received event after terminal workflow event.");
        }

        yield event;

        if (TERMINAL_EVENT_TYPES.has(event.type)) {
          terminalReceived = true;
        }
      }
    }

    const trailing = pendingBuffer.trim();

    if (trailing !== "") {
      throw new ChatStreamProtocolError("NDJSON stream ended with an incomplete JSON line.");
    }
  } finally {
    reader.releaseLock();
  }
}

export function validateChatWorkflowStreamWireEvent(value: unknown): ChatWorkflowStreamWireEvent {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new ChatStreamProtocolError("Wire event must be an object with type.");
  }

  switch (value.type) {
    case "workflow:start":
      assertString(value.workflowId, "workflowId");
      assertString(value.timestamp, "timestamp");
      return value as ChatWorkflowStreamWireEvent;
    case "step:start":
      assertString(value.workflowId, "workflowId");
      assertString(value.step, "step");
      assertString(value.timestamp, "timestamp");
      return value as ChatWorkflowStreamWireEvent;
    case "step:end":
      assertString(value.workflowId, "workflowId");
      assertString(value.step, "step");
      assertString(value.timestamp, "timestamp");
      assertString(value.status, "status");
      if (!WORKFLOW_STEP_STATUSES.has(value.status)) {
        throw new ChatStreamProtocolError("Invalid workflow step status.");
      }
      if (value.summary !== undefined && !isJsonSafeRecord(value.summary)) {
        throw new ChatStreamProtocolError("step:end summary must be JSON-safe.");
      }
      return value as ChatWorkflowStreamWireEvent;
    case "text:delta":
      assertString(value.workflowId, "workflowId");
      assertString(value.text, "text");
      if (value.model !== undefined) {
        assertString(value.model, "model");
      }
      return value as ChatWorkflowStreamWireEvent;
    case "tool:call":
      assertString(value.workflowId, "workflowId");
      if (!isRecord(value.call) || typeof value.call.name !== "string") {
        throw new ChatStreamProtocolError("tool:call requires call.name.");
      }
      if (!isJsonSafe(value.call.arguments)) {
        throw new ChatStreamProtocolError("tool:call arguments must be JSON-safe.");
      }
      return value as ChatWorkflowStreamWireEvent;
    case "tool:result":
      assertString(value.workflowId, "workflowId");
      if (!isRecord(value.result) || typeof value.result.name !== "string") {
        throw new ChatStreamProtocolError("tool:result requires result.name.");
      }
      if (!isJsonSafe(value.result.result)) {
        throw new ChatStreamProtocolError("tool:result result must be JSON-safe.");
      }
      return value as ChatWorkflowStreamWireEvent;
    case "workflow:finish":
      assertString(value.workflowId, "workflowId");
      if (!isRecord(value.output) || typeof value.output.text !== "string") {
        throw new ChatStreamProtocolError("workflow:finish requires output.text.");
      }
      return value as ChatWorkflowStreamWireEvent;
    case "workflow:error":
      assertString(value.workflowId, "workflowId");
      if (!isRecord(value.error)) {
        throw new ChatStreamProtocolError("workflow:error requires error object.");
      }
      assertString(value.error.code, "error.code");
      assertString(value.error.message, "error.message");
      if (!SAFE_ERROR_CODES.has(value.error.code)) {
        throw new ChatStreamProtocolError("Invalid workflow error code.");
      }
      if (value.error.details !== undefined) {
        validateSafeErrorDetails(value.error.details);
      }
      return value as ChatWorkflowStreamWireEvent;
    default:
      throw new ChatStreamProtocolError(`Unknown wire event type: ${value.type}`);
  }
}

function parseWireEventLine(line: string): ChatWorkflowStreamWireEvent | null {
  if (line.trim() === "") {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(line);
  } catch (error) {
    throw new ChatStreamProtocolError(
      error instanceof Error ? error.message : "Invalid NDJSON line.",
    );
  }

  return validateChatWorkflowStreamWireEvent(parsed);
}

function validateSafeErrorDetails(value: unknown): asserts value is SafeErrorDetails {
  if (!isJsonSafeRecord(value)) {
    throw new ChatStreamProtocolError("workflow:error details must be a JSON-safe object.");
  }

  if ("reason" in value && typeof value.reason !== "string") {
    throw new ChatStreamProtocolError("workflow:error details.reason must be string.");
  }
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ChatStreamProtocolError(`${field} must be a non-empty string.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonSafeRecord(value: unknown): value is Record<string, JsonValue> {
  return isRecord(value) && Object.values(value).every(isJsonSafe);
}

function isJsonSafe(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonSafe);
  }
  if (isRecord(value)) {
    return Object.values(value).every(isJsonSafe);
  }

  return false;
}
