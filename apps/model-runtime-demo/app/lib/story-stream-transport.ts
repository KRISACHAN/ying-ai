import type { JsonValue } from "./chat-stream-wire";
import type { StoryWorkflowStreamWireEvent } from "./story-stream-wire";

const encoder = new TextEncoder();
const TERMINAL_EVENT_TYPES = new Set(["story:finish", "story:error"]);
const STORY_EVENT_TYPES = new Set([
  "story:start",
  "story:session-loaded",
  "story:state-loaded",
  "story:summary-loaded",
  "story:lore-recalled",
  "story:context-ready",
  "story:plan-started",
  "story:plan-completed",
  "story:validation-failed",
  "story:state-prepared",
  "story:render-started",
  "story:text-delta",
  "story:render-completed",
  "story:committed",
  "story:summary-updated",
  "story:finish",
  "story:error",
]);

export class StoryStreamProtocolError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "StoryStreamProtocolError";
  }
}

export function encodeStoryNdjson(event: StoryWorkflowStreamWireEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

export async function* parseStoryNdjsonWireEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<StoryWorkflowStreamWireEvent> {
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
          throw new StoryStreamProtocolError("Received event after terminal story event.");
        }
        yield event;
        if (TERMINAL_EVENT_TYPES.has(event.type)) {
          terminalReceived = true;
        }
      }
    }

    if (pendingBuffer.trim() !== "") {
      throw new StoryStreamProtocolError("NDJSON stream ended with an incomplete JSON line.");
    }
    if (!terminalReceived) {
      throw new StoryStreamProtocolError("NDJSON stream ended before a terminal story event.");
    }
  } finally {
    reader.releaseLock();
  }
}

export function validateStoryWorkflowStreamWireEvent(value: unknown): StoryWorkflowStreamWireEvent {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new StoryStreamProtocolError("Wire event must be an object with type.");
  }
  if (!STORY_EVENT_TYPES.has(value.type)) {
    throw new StoryStreamProtocolError(`Unknown story wire event type: ${value.type}`);
  }

  assertString(value.workflowId, "workflowId");
  assertString(value.sessionId, "sessionId");
  assertString(value.clientTurnId, "clientTurnId");
  assertNumber(value.sequence, "sequence");
  assertString(value.occurredAt, "occurredAt");

  switch (value.type) {
    case "story:text-delta":
    case "story:render-completed":
      assertString(value.text, "text");
      break;
    case "story:finish":
      if (!isRecord(value.output) || typeof value.output.text !== "string") {
        throw new StoryStreamProtocolError("story:finish requires output.text.");
      }
      break;
    case "story:error":
      if (!isRecord(value.error)) {
        throw new StoryStreamProtocolError("story:error requires error object.");
      }
      assertString(value.error.code, "error.code");
      assertString(value.error.message, "error.message");
      if (value.error.details !== undefined && !isJsonSafeRecord(value.error.details)) {
        throw new StoryStreamProtocolError("story:error details must be JSON-safe.");
      }
      break;
    case "story:start":
      break;
    default:
      if (!isRecord(value.payload) || !isJsonSafeRecord(value.payload)) {
        throw new StoryStreamProtocolError(`${value.type} requires JSON-safe payload.`);
      }
      break;
  }

  return value as StoryWorkflowStreamWireEvent;
}

function parseWireEventLine(line: string): StoryWorkflowStreamWireEvent | null {
  if (line.trim() === "") {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    throw new StoryStreamProtocolError(
      error instanceof Error ? error.message : "Invalid NDJSON line.",
    );
  }

  return validateStoryWorkflowStreamWireEvent(parsed);
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new StoryStreamProtocolError(`${field} must be a non-empty string.`);
  }
}

function assertNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StoryStreamProtocolError(`${field} must be a finite number.`);
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
  if (value instanceof Date) {
    return false;
  }
  if (isRecord(value)) {
    return Object.values(value).every(isJsonSafe);
  }
  return false;
}
