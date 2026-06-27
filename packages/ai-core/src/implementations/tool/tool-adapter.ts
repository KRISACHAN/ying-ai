import { jsonSchema, type ToolSet } from "ai";

import type { ChatMessage, ModelToolCall } from "../../abstractions/model";
import type { ToolCall, ToolDefinition, ToolResult } from "../../abstractions/tool";
import { formatToolResultForModel } from "./format-tool-results";

/** 将 Core 工具定义转换为模型实现层可消费的 AI SDK ToolSet。 */
export function toModelTools(definitions: ToolDefinition[]): Record<string, unknown> | undefined {
  if (definitions.length === 0) {
    return undefined;
  }

  const tools: ToolSet = {};

  for (const definition of definitions) {
    tools[definition.name] = {
      type: "dynamic",
      description: definition.description,
      inputSchema: jsonSchema(toJsonSchema(definition)),
      ...(definition.metadata !== undefined ? { metadata: toToolMetadata(definition) } : {}),
    };
  }

  return tools as Record<string, unknown>;
}

/** 将模型返回的 tool call 转换为 Core 工具调用。 */
export function toCoreToolCall(modelToolCall: ModelToolCall): ToolCall {
  return {
    name: modelToolCall.name,
    ...(modelToolCall.id !== undefined ? { id: modelToolCall.id } : {}),
    arguments: parseArguments(modelToolCall.arguments),
  };
}

/** 拼装工具执行后的 final generate 消息。 */
export function buildToolFollowUpMessages(
  messages: ChatMessage[],
  modelText: string,
  toolCalls: ModelToolCall[],
  toolResults: ToolResult[],
): ChatMessage[] {
  return [
    ...messages,
    {
      role: "assistant",
      content: modelText,
      toolCalls,
    },
    ...toolResults.map(
      (result): ChatMessage => ({
        role: "tool",
        content: formatToolResultForModel(result),
        name: result.name,
        ...(result.toolCallId !== undefined ? { toolCallId: result.toolCallId } : {}),
      }),
    ),
  ];
}

function parseArguments(argumentsValue: unknown): unknown {
  if (typeof argumentsValue !== "string") {
    return argumentsValue;
  }

  try {
    return JSON.parse(argumentsValue) as unknown;
  } catch {
    return argumentsValue;
  }
}

function toJsonSchema(definition: ToolDefinition): Record<string, unknown> {
  const schema = definition.parameters ?? { type: "object" as const };

  return {
    type: "object",
    ...(schema.properties !== undefined ? { properties: schema.properties } : {}),
    ...(schema.required !== undefined ? { required: schema.required } : {}),
    ...(schema.additionalProperties !== undefined
      ? { additionalProperties: schema.additionalProperties }
      : {}),
  };
}

function toToolMetadata(
  definition: ToolDefinition,
): Record<string, string | number | boolean | null> {
  const metadata: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(definition.metadata ?? {})) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      metadata[key] = value;
    }
  }

  return metadata;
}
