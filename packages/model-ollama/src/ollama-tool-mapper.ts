import type { ModelToolCall } from "@ying-ai/ai-core";
import type { ChatResponse, Tool, ToolCall } from "ollama";

import { OllamaAdapterError } from "./errors";

interface DynamicToolShape {
  type: "dynamic";
  description?: string;
  inputSchema: {
    jsonSchema: Record<string, unknown>;
  };
  metadata?: Record<string, string | number | boolean | null>;
}

export function toOllamaTools(tools: Record<string, unknown> | undefined): Tool[] | undefined {
  if (tools === undefined || Object.keys(tools).length === 0) {
    return undefined;
  }

  return Object.entries(tools).map(([name, value]) => toOllamaTool(name, value));
}

export function toModelToolCalls(
  toolCalls: ChatResponse["message"]["tool_calls"] | undefined,
): ModelToolCall[] | undefined {
  if (toolCalls === undefined || toolCalls.length === 0) {
    return undefined;
  }

  return toolCalls.map(toModelToolCall);
}

function toOllamaTool(name: string, value: unknown): Tool {
  if (name.trim() === "") {
    throw new OllamaAdapterError("tool_mapping_failed", "Cannot map unnamed tool.");
  }

  if (!isDynamicToolShape(value)) {
    throw new OllamaAdapterError(
      "tool_mapping_failed",
      `Cannot map tool "${name}" because it is not an AI SDK dynamic tool shape.`,
    );
  }

  const tool: Tool = {
    type: "function",
    function: {
      name,
      parameters: value.inputSchema.jsonSchema as NonNullable<Tool["function"]["parameters"]>,
    },
  };

  if (value.description !== undefined) {
    tool.function.description = value.description;
  }

  return tool;
}

function toModelToolCall(toolCall: ToolCall): ModelToolCall {
  const name = toolCall.function.name;

  if (name.trim() === "") {
    throw new OllamaAdapterError("tool_mapping_failed", "Ollama returned an unnamed tool call.");
  }

  return {
    name,
    arguments: normalizeToolArguments(toolCall.function.arguments),
  };
}

function normalizeToolArguments(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new OllamaAdapterError(
      "tool_mapping_failed",
      "Ollama returned tool call arguments that are not valid JSON.",
    );
  }
}

function isDynamicToolShape(value: unknown): value is DynamicToolShape {
  if (!isRecord(value)) {
    return false;
  }

  const inputSchema = value.inputSchema;

  return value.type === "dynamic" && isRecord(inputSchema) && isRecord(inputSchema.jsonSchema);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
