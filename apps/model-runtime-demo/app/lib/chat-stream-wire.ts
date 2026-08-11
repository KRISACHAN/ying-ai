import type {
  ChatWorkflowOutput,
  ChatWorkflowStreamEvent,
  ModelToolCall,
  SafeWorkflowError,
  ToolResult,
  WorkflowStepName,
  WorkflowStepStatus,
} from "@ying-ai/ai-core";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type SafeErrorDetails = Record<string, JsonValue>;

export interface SerializableSafeWorkflowError {
  code: SafeWorkflowError["code"];
  message: string;
  retryable?: boolean;
  step?: SafeWorkflowError["step"];
  details?: SafeErrorDetails;
}

export interface SerializableModelToolCall {
  id?: string;
  name: string;
  arguments: JsonValue;
}

export interface SerializableToolResult {
  toolCallId?: string;
  name: string;
  result: JsonValue;
  ok?: boolean;
  error?: JsonValue;
  metadata?: JsonValue;
}

export interface SerializableChatWorkflowOutput {
  text: string;
  model?: string;
  persona?: JsonValue;
  memories?: JsonValue;
  emotion?: JsonValue;
  toolResults?: SerializableToolResult[];
  safety?: JsonValue;
  metadata?: JsonValue;
  modelOutput?: JsonValue;
  trace?: JsonValue;
}

export type ChatWorkflowStreamWireEvent =
  | { type: "workflow:start"; workflowId: string; timestamp: string }
  | { type: "step:start"; workflowId: string; step: WorkflowStepName; timestamp: string }
  | {
      type: "step:end";
      workflowId: string;
      step: WorkflowStepName;
      timestamp: string;
      status: WorkflowStepStatus;
      summary?: Record<string, JsonValue>;
    }
  | { type: "text:delta"; workflowId: string; text: string; model?: string }
  | { type: "tool:call"; workflowId: string; call: SerializableModelToolCall }
  | { type: "tool:result"; workflowId: string; result: SerializableToolResult }
  | {
      type: "workflow:finish";
      workflowId: string;
      output: SerializableChatWorkflowOutput;
    }
  | { type: "workflow:error"; workflowId: string; error: SerializableSafeWorkflowError };

export function toChatWorkflowStreamWireEvent(
  event: ChatWorkflowStreamEvent,
): ChatWorkflowStreamWireEvent {
  switch (event.type) {
    case "workflow:start":
      return {
        type: event.type,
        workflowId: event.workflowId,
        timestamp: event.timestamp.toISOString(),
      };
    case "step:start":
      return {
        type: event.type,
        workflowId: event.workflowId,
        step: event.step,
        timestamp: event.timestamp.toISOString(),
      };
    case "step:end":
      return {
        type: event.type,
        workflowId: event.workflowId,
        step: event.step,
        timestamp: event.timestamp.toISOString(),
        status: event.status,
        ...(event.summary !== undefined ? { summary: toJsonRecord(event.summary) } : {}),
      };
    case "text:delta":
      return {
        type: event.type,
        workflowId: event.workflowId,
        text: event.text,
        ...(event.model !== undefined ? { model: event.model } : {}),
      };
    case "tool:call":
      return {
        type: event.type,
        workflowId: event.workflowId,
        call: toSerializableModelToolCall(event.call),
      };
    case "tool:result":
      return {
        type: event.type,
        workflowId: event.workflowId,
        result: toSerializableToolResult(event.result),
      };
    case "workflow:finish":
      return {
        type: event.type,
        workflowId: event.workflowId,
        output: toSerializableChatWorkflowOutput(event.output),
      };
    case "workflow:error":
      return {
        type: event.type,
        workflowId: event.workflowId,
        error: sanitizeSafeWorkflowError(event.error),
      };
  }
}

export function toSerializableChatWorkflowOutput(
  output: ChatWorkflowOutput,
): SerializableChatWorkflowOutput {
  return {
    text: output.text,
    ...(output.model !== undefined ? { model: output.model } : {}),
    ...(output.persona !== undefined ? { persona: toJsonValue(output.persona) } : {}),
    ...(output.memories !== undefined ? { memories: toJsonValue(output.memories) } : {}),
    ...(output.emotion !== undefined ? { emotion: toJsonValue(output.emotion) } : {}),
    ...(output.toolResults !== undefined
      ? { toolResults: output.toolResults.map(toSerializableToolResult) }
      : {}),
    ...(output.safety !== undefined ? { safety: toJsonValue(output.safety) } : {}),
    ...(output.metadata !== undefined ? { metadata: toJsonValue(output.metadata) } : {}),
    ...(output.metadata?.trace !== undefined ? { trace: toJsonValue(output.metadata.trace) } : {}),
    ...(output.modelOutput !== undefined
      ? {
          modelOutput: toJsonValue({
            text: output.modelOutput.text,
            model: output.modelOutput.model,
            toolCalls: output.modelOutput.toolCalls,
            usage: output.modelOutput.usage,
            runtime: output.modelOutput.runtime,
          }),
        }
      : {}),
  };
}

export function toSerializableModelToolCall(call: ModelToolCall): SerializableModelToolCall {
  return {
    ...(call.id !== undefined ? { id: call.id } : {}),
    name: call.name,
    arguments: toJsonValue(call.arguments),
  };
}

export function toSerializableToolResult(result: ToolResult): SerializableToolResult {
  return {
    ...(result.toolCallId !== undefined ? { toolCallId: result.toolCallId } : {}),
    name: result.name,
    result: toJsonValue(result.result),
    ...(result.ok !== undefined ? { ok: result.ok } : {}),
    ...(result.error !== undefined ? { error: toJsonValue(result.error) } : {}),
    ...(result.metadata !== undefined ? { metadata: toJsonValue(result.metadata) } : {}),
  };
}

export function createWorkflowErrorWireEvent(input: {
  workflowId: string;
  code: SafeWorkflowError["code"];
  message: string;
  retryable?: boolean;
  step?: SafeWorkflowError["step"];
  details?: SafeErrorDetails;
}): ChatWorkflowStreamWireEvent {
  return {
    type: "workflow:error",
    workflowId: input.workflowId,
    error: {
      code: input.code,
      message: input.message,
      ...(input.retryable !== undefined ? { retryable: input.retryable } : {}),
      ...(input.step !== undefined ? { step: input.step } : {}),
      ...(input.details !== undefined ? { details: input.details } : {}),
    },
  };
}

function sanitizeSafeWorkflowError(error: SafeWorkflowError): SerializableSafeWorkflowError {
  return {
    code: error.code,
    message: error.message,
    ...(error.retryable !== undefined ? { retryable: error.retryable } : {}),
    ...(error.step !== undefined ? { step: error.step } : {}),
    ...(error.details !== undefined ? { details: sanitizeErrorDetails(error.details) } : {}),
  };
}

function sanitizeErrorDetails(details: Record<string, unknown>): SafeErrorDetails {
  return toJsonRecord(details);
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
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (typeof value !== "object") {
    return null;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValueOrUndefined(item, seen) ?? null);
  }
  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, item]) => ({
      key: toJsonValueOrUndefined(key, seen) ?? null,
      value: toJsonValueOrUndefined(item, seen) ?? null,
    }));
  }
  if (value instanceof Set) {
    return Array.from(value.values()).map((item) => toJsonValueOrUndefined(item, seen) ?? null);
  }

  const output: Record<string, JsonValue> = {};

  for (const [key, item] of Object.entries(value)) {
    if (key === "raw" || key === "stack" || key === "cause") {
      continue;
    }

    const mapped = toJsonValueOrUndefined(item, seen);

    if (mapped !== undefined) {
      output[key] = mapped;
    }
  }

  return output;
}
