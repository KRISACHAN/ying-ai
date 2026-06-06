import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  generateText,
  streamText,
  type LanguageModelUsage,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type TypedToolCall,
} from "ai";

import type {
  ChatMessage,
  ChatModel,
  GenerateInput,
  GenerateOutput,
  GenerateStreamChunk,
  GenerateUsage,
  ModelToolCall,
} from "../../abstractions/model";
import type { OpenAICompatibleConfig } from "../../config/model-config";

export class OpenAICompatibleModel implements ChatModel {
  private readonly config: OpenAICompatibleConfig;

  public constructor(config: OpenAICompatibleConfig) {
    this.config = config;
  }

  public async generate(input: GenerateInput): Promise<GenerateOutput> {
    const result = await generateText(this.createTextOptions(input));

    const output: GenerateOutput = {
      text: result.text,
      model: input.model ?? this.config.model,
      raw: result.response,
    };
    const usage = toGenerateUsage(result.usage);
    const toolCalls = toModelToolCalls(result.toolCalls);

    if (usage !== undefined) {
      output.usage = usage;
    }

    if (toolCalls !== undefined) {
      output.toolCalls = toolCalls;
    }

    return output;
  }

  public async *stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk> {
    const result = streamText(this.createTextOptions(input));

    for await (const text of result.textStream) {
      yield {
        text,
        model: input.model ?? this.config.model,
        raw: { provider: "ai-sdk" },
      };
    }

    const usage = toGenerateUsage(await result.usage);

    if (usage !== undefined) {
      yield {
        text: "",
        model: input.model ?? this.config.model,
        raw: { provider: "ai-sdk", event: "finish" },
        usage,
      };
    }
  }

  private createProvider() {
    // Keep protocol details in the AI SDK provider; Core only adapts project-level contracts.
    return createOpenAICompatible({
      name: "openai-compatible",
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      includeUsage: true,
    });
  }

  private createTextOptions(input: GenerateInput): TextOptions {
    // TODO(stage-tool-system): Map validated Core tool descriptors to AI SDK ToolSet when tool execution lands.
    // The Stage 1 runtime intentionally ignores tools instead of passing unchecked data into the provider.
    void input.tools;

    const options: TextOptions = {
      model: this.createProvider()(input.model ?? this.config.model),
      messages: toAiSdkMessages(input.messages),
    };

    if (input.temperature !== undefined) {
      options.temperature = input.temperature;
    }

    if (input.maxTokens !== undefined) {
      options.maxOutputTokens = input.maxTokens;
    }

    return options;
  }
}

interface TextOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

function toAiSdkMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((message): ModelMessage => {
    if (message.role === "tool") {
      // Tool execution belongs to a later stage; fail explicitly instead of silently dropping context.
      throw new Error("Tool role messages are not supported until the Tool System stage.");
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
}

function toGenerateUsage(usage: LanguageModelUsage): GenerateUsage | undefined {
  const output: GenerateUsage = {};

  if (usage.inputTokens !== undefined) {
    output.promptTokens = usage.inputTokens;
  }

  if (usage.outputTokens !== undefined) {
    output.completionTokens = usage.outputTokens;
  }

  if (usage.totalTokens !== undefined) {
    output.totalTokens = usage.totalTokens;
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function toModelToolCalls(toolCalls: Array<TypedToolCall<ToolSet>>): ModelToolCall[] | undefined {
  if (toolCalls.length === 0) {
    return undefined;
  }

  return toolCalls.map((toolCall) => ({
    name: toolCall.toolName,
    arguments: toolCall.input,
  }));
}
