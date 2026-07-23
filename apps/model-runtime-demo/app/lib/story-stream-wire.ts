import type { StoryState, StoryTurnPlan, StoryWorkflowEvent } from "@ying-companion/story-core";

import type { JsonValue } from "./chat-stream-wire";

export interface SerializableStoryWorkflowError {
  code: string;
  message: string;
  details?: Record<string, JsonValue>;
}

export interface SerializableStoryWorkflowOutput {
  sessionId: string;
  clientTurnId: string;
  text: string;
  turnId?: string;
  stateRevision?: number;
  summaryStatus?: "updated" | "unchanged" | "failed";
}

export type StoryPayloadWireEventType =
  | "story:session-loaded"
  | "story:state-loaded"
  | "story:summary-loaded"
  | "story:lore-recalled"
  | "story:context-ready"
  | "story:plan-started"
  | "story:plan-completed"
  | "story:validation-failed"
  | "story:state-prepared"
  | "story:render-started"
  | "story:committed"
  | "story:summary-updated";

export type StoryWorkflowStreamWireEvent =
  | {
      type: "story:start";
      workflowId: string;
      sessionId: string;
      clientTurnId: string;
      sequence: number;
      occurredAt: string;
    }
  | {
      type: StoryPayloadWireEventType;
      workflowId: string;
      sessionId: string;
      clientTurnId: string;
      sequence: number;
      occurredAt: string;
      payload: Record<string, JsonValue>;
    }
  | {
      type: "story:text-delta";
      workflowId: string;
      sessionId: string;
      clientTurnId: string;
      sequence: number;
      occurredAt: string;
      text: string;
    }
  | {
      type: "story:render-completed";
      workflowId: string;
      sessionId: string;
      clientTurnId: string;
      sequence: number;
      occurredAt: string;
      text: string;
    }
  | {
      type: "story:finish";
      workflowId: string;
      sessionId: string;
      clientTurnId: string;
      sequence: number;
      occurredAt: string;
      output: SerializableStoryWorkflowOutput;
    }
  | {
      type: "story:error";
      workflowId: string;
      sessionId: string;
      clientTurnId: string;
      sequence: number;
      occurredAt: string;
      error: SerializableStoryWorkflowError;
    };

export function toStoryWorkflowStreamWireEvent(
  event: StoryWorkflowEvent,
  output?: SerializableStoryWorkflowOutput,
): StoryWorkflowStreamWireEvent {
  const base = {
    workflowId: event.runId,
    sessionId: event.sessionId,
    clientTurnId: event.clientTurnId,
    sequence: event.sequence,
    occurredAt: event.occurredAt.toISOString(),
  };

  switch (event.type) {
    case "story:start":
      return { type: event.type, ...base };
    case "story:text-delta":
      return { type: event.type, ...base, text: event.delta };
    case "story:render-completed":
      return { type: event.type, ...base, text: event.assistantText };
    case "story:finish":
      return {
        type: event.type,
        ...base,
        output: output ?? {
          sessionId: event.sessionId,
          clientTurnId: event.clientTurnId,
          text: "",
        },
      };
    case "story:error":
      return {
        type: event.type,
        ...base,
        error: {
          code: event.code,
          message: errorMessage(event.error),
          details: toJsonRecord({ error: event.error }),
        },
      };
    default:
      return {
        type: event.type,
        ...base,
        payload: eventPayload(event),
      };
  }
}

export function createStoryErrorWireEvent(input: {
  workflowId: string;
  sessionId: string;
  clientTurnId: string;
  sequence?: number;
  code: string;
  message: string;
  details?: Record<string, JsonValue>;
}): StoryWorkflowStreamWireEvent {
  return {
    type: "story:error",
    workflowId: input.workflowId,
    sessionId: input.sessionId,
    clientTurnId: input.clientTurnId,
    sequence: input.sequence ?? 1,
    occurredAt: new Date().toISOString(),
    error: {
      code: input.code,
      message: input.message,
      ...(input.details ? { details: input.details } : {}),
    },
  };
}

function eventPayload(
  event: Exclude<
    StoryWorkflowEvent,
    | { type: "story:start" }
    | { type: "story:text-delta" }
    | { type: "story:finish" }
    | { type: "story:error" }
    | { type: "story:render-completed" }
  >,
): Record<string, JsonValue> {
  const payload = { ...event } as Record<string, unknown>;
  delete payload.type;
  delete payload.runId;
  delete payload.sessionId;
  delete payload.clientTurnId;
  delete payload.sequence;
  delete payload.occurredAt;
  return toJsonRecord(payload);
}

export function toSerializableStoryOutput(input: {
  sessionId: string;
  clientTurnId: string;
  text: string;
  turnId?: string;
  state?: StoryState;
  summaryStatus?: "updated" | "unchanged" | "failed";
}): SerializableStoryWorkflowOutput {
  return {
    sessionId: input.sessionId,
    clientTurnId: input.clientTurnId,
    text: input.text,
    ...(input.turnId ? { turnId: input.turnId } : {}),
    ...(input.state ? { stateRevision: input.state.revision } : {}),
    ...(input.summaryStatus ? { summaryStatus: input.summaryStatus } : {}),
  };
}

export function toSerializablePlan(plan: StoryTurnPlan): JsonValue {
  return toJsonValue(plan);
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause;
  if (cause instanceof Error && cause.message !== error.message) {
    const attempts = modelAttemptSummary(cause);
    return `${error.message}: ${cause.message}${attempts === "" ? "" : ` (${attempts})`}`;
  }

  return error.message;
}

function modelAttemptSummary(error: Error): string {
  if (!("errors" in error) || !Array.isArray(error.errors)) {
    return "";
  }

  return error.errors
    .slice(0, 3)
    .map((item: unknown) => {
      if (typeof item !== "object" || item === null) {
        return undefined;
      }
      const record = item as Record<string, unknown>;
      const model = typeof record.model === "string" ? record.model : "unknown-model";
      const phase = typeof record.phase === "string" ? record.phase : "attempt";
      const attempt = typeof record.attempt === "number" ? `#${record.attempt}` : "";
      const message = typeof record.message === "string" ? record.message : "unknown error";
      return `${phase} ${model}${attempt}: ${message}`;
    })
    .filter((item): item is string => item !== undefined)
    .join("; ");
}

function toJsonRecord(value: Record<string, unknown>): Record<string, JsonValue> {
  const output: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    const mapped = toJsonValueOrUndefined(item, new WeakSet<object>());
    if (mapped !== undefined) {
      output[key] = mapped;
    }
  }
  return output;
}

function toJsonValue(value: unknown): JsonValue {
  return toJsonValueOrUndefined(value, new WeakSet<object>()) ?? null;
}

function toJsonValueOrUndefined(value: unknown, seen: WeakSet<object>): JsonValue | undefined {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => toJsonValueOrUndefined(item, seen))
      .filter((item): item is JsonValue => item !== undefined);
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    const record: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const mapped = toJsonValueOrUndefined(item, seen);
      if (mapped !== undefined) {
        record[key] = mapped;
      }
    }
    seen.delete(value);
    return record;
  }
  return undefined;
}
