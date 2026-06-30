import type {
  ChatMessage,
  GenerateInput,
  GenerateUsage,
  ModelToolCall,
} from "@ying-companion/ai-core";
import type { ChatRequest, ChatResponse, Message } from "ollama";

import { OllamaAdapterError } from "./errors";

export function toOllamaMessages(messages: ChatMessage[]): Message[] {
  return messages.map((message): Message => {
    if (message.role === "assistant" && (message.toolCalls?.length ?? 0) > 0) {
      return toAssistantToolMessage(message);
    }

    if (message.role === "tool") {
      return toToolResultMessage(message);
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
}

export function toOllamaRequestOptions(
  input: GenerateInput,
  keepAlive?: string | number,
): Pick<ChatRequest, "messages" | "options" | "keep_alive" | "format"> {
  const request: Pick<ChatRequest, "messages" | "options" | "keep_alive" | "format"> = {
    messages: toOllamaMessages(input.messages),
  };
  const options: NonNullable<ChatRequest["options"]> = {};

  if (input.temperature !== undefined) {
    options.temperature = input.temperature;
  }

  if (input.maxTokens !== undefined) {
    options.num_predict = input.maxTokens;
  }

  if (Object.keys(options).length > 0) {
    request.options = options;
  }

  if (keepAlive !== undefined) {
    request.keep_alive = keepAlive;
  }

  if (input.structuredOutput?.type === "object") {
    request.format = "json";
  }

  return request;
}

export function toGenerateUsage(response: Partial<ChatResponse>): GenerateUsage | undefined {
  const output: GenerateUsage = {};
  const promptTokens = toFiniteTokenCount(response.prompt_eval_count);
  const completionTokens = toFiniteTokenCount(response.eval_count);

  if (promptTokens !== undefined) {
    output.promptTokens = promptTokens;
  }

  if (completionTokens !== undefined) {
    output.completionTokens = completionTokens;
  }

  if (promptTokens !== undefined && completionTokens !== undefined) {
    output.totalTokens = promptTokens + completionTokens;
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function toAssistantToolMessage(message: ChatMessage): Message {
  return {
    role: "assistant",
    content: message.content,
    tool_calls: (message.toolCalls ?? []).map(toOllamaToolCall),
  };
}

function toToolResultMessage(message: ChatMessage): Message {
  if (message.name === undefined || message.name.trim() === "") {
    throw new OllamaAdapterError(
      "message_mapping_failed",
      "Cannot map tool result message without a tool name.",
    );
  }

  return {
    role: "tool",
    content: message.content,
    tool_name: message.name,
  };
}

function toOllamaToolCall(toolCall: ModelToolCall): NonNullable<Message["tool_calls"]>[number] {
  if (toolCall.name.trim() === "") {
    throw new OllamaAdapterError(
      "message_mapping_failed",
      "Cannot map assistant tool call without a tool name.",
    );
  }

  return {
    function: {
      name: toolCall.name,
      arguments: toToolCallArguments(toolCall.arguments),
    },
  };
}

function toToolCallArguments(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  throw new OllamaAdapterError(
    "message_mapping_failed",
    "Ollama tool call arguments must be a structured object.",
  );
}

function toFiniteTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
