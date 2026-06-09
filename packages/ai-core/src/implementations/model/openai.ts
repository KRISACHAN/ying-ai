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

import { ModelRuntimeError } from "../../errors/model-runtime-error";
import type {
  ChatMessage,
  ChatModel,
  GenerateInput,
  GenerateOutput,
  GenerateStreamChunk,
  GenerateUsage,
  ModelAttemptPhase,
  ModelRuntimeErrorItem,
  ModelRuntimeInfo,
  ModelToolCall,
} from "../../abstractions/model";
import type { OpenAICompatibleConfig } from "../../config/model-config";

const DEFAULT_PRIMARY_MAX_RETRIES = 0;
const DEFAULT_FALLBACK_MAX_RETRIES = 0;
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const MAX_ERROR_MESSAGE_LENGTH = 240;

export class OpenAICompatibleModel implements ChatModel {
  public readonly meta = {
    id: "model.openai-compatible",
    kind: "model",
    name: "OpenAI Compatible Model",
  } as const;

  private readonly config: OpenAICompatibleConfig;
  private readonly provider: ReturnType<typeof createOpenAICompatible>;

  public constructor(config: OpenAICompatibleConfig) {
    this.config = config;
    // Provider configuration is immutable for this model instance, so retries reuse the same factory.
    this.provider = createOpenAICompatible({
      name: "openai-compatible",
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl ?? DEFAULT_OPENAI_BASE_URL,
      includeUsage: true,
    });
  }

  public async generate(input: GenerateInput): Promise<GenerateOutput> {
    const state = createRuntimeState();

    for (const plan of this.createAttemptPlans(input)) {
      for (let attempt = 1; attempt <= getMaxAttempts(plan.maxRetries); attempt++) {
        recordAttempt(state, plan.phase);

        try {
          const output = await this.generateOnce(input, plan.model);

          validateGenerateOutput(output);

          return {
            ...output,
            runtime: createRuntimeInfo(plan, state),
          };
        } catch (error) {
          state.errors.push(toRuntimeErrorItem(error, plan, attempt));
        }
      }
    }

    throw createModelRuntimeError(state.errors);
  }

  public async *stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk> {
    const state = createRuntimeState();

    for (const plan of this.createAttemptPlans(input)) {
      for (let attempt = 1; attempt <= getMaxAttempts(plan.maxRetries); attempt++) {
        recordAttempt(state, plan.phase);
        let hasYieldedText = false;

        try {
          const result = streamText(this.createTextOptions(input, plan.model));

          for await (const text of result.textStream) {
            hasYieldedText = true;
            yield {
              text,
              model: plan.model,
              raw: { provider: "ai-sdk" },
            };
          }

          const usage = toGenerateUsage(await result.usage);
          const finishChunk: GenerateStreamChunk = {
            text: "",
            model: plan.model,
            raw: { provider: "ai-sdk", event: "finish" },
            runtime: createRuntimeInfo(plan, state),
          };

          if (usage !== undefined) {
            finishChunk.usage = usage;
          }

          yield finishChunk;
          return;
        } catch (error) {
          const runtimeError = toRuntimeErrorItem(error, plan, attempt);
          state.errors.push(runtimeError);

          if (hasYieldedText) {
            throw createModelRuntimeError(state.errors);
          }
        }
      }
    }

    throw createModelRuntimeError(state.errors);
  }

  private createTextOptions(input: GenerateInput, model: string): TextOptions {
    // TODO(stage-tool-system): Map validated Core tool descriptors to AI SDK ToolSet when tool execution lands.
    // The Stage 1 runtime intentionally ignores tools instead of passing unchecked data into the provider.
    void input.tools;

    const options: TextOptions = {
      model: this.provider(model),
      messages: toAiSdkMessages(input.messages),
      maxRetries: 0,
    };

    if (input.temperature !== undefined) {
      options.temperature = input.temperature;
    }

    if (input.maxTokens !== undefined) {
      options.maxOutputTokens = input.maxTokens;
    }

    return options;
  }

  private async generateOnce(input: GenerateInput, model: string): Promise<GenerateOutput> {
    const result = await generateText(this.createTextOptions(input, model));

    const output: GenerateOutput = {
      text: result.text,
      model,
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

  private createAttemptPlans(input: GenerateInput): ModelAttemptPlan[] {
    // Per-call model override affects only the primary plan; fallback remains the configured fallback.
    const plans: ModelAttemptPlan[] = [
      {
        phase: "primary",
        model: input.model ?? this.config.model,
        maxRetries: normalizeMaxRetries(
          this.config.retry?.primaryMaxRetries,
          DEFAULT_PRIMARY_MAX_RETRIES,
        ),
      },
    ];

    if (this.config.fallbackModel !== undefined && this.config.fallbackModel.trim() !== "") {
      plans.push({
        phase: "fallback",
        model: this.config.fallbackModel,
        maxRetries: normalizeMaxRetries(
          this.config.retry?.fallbackMaxRetries,
          DEFAULT_FALLBACK_MAX_RETRIES,
        ),
      });
    }

    return plans;
  }
}

interface TextOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  maxRetries: number;
}

interface ModelAttemptPlan {
  phase: ModelAttemptPhase;
  model: string;
  maxRetries: number;
}

interface RuntimeState {
  primaryAttempts: number;
  fallbackAttempts: number;
  errors: ModelRuntimeErrorItem[];
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

function validateGenerateOutput(output: GenerateOutput): void {
  if (!output.text.trim() && (output.toolCalls?.length ?? 0) === 0) {
    throw new Error("Model output is empty");
  }
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

function createRuntimeState(): RuntimeState {
  return {
    primaryAttempts: 0,
    fallbackAttempts: 0,
    errors: [],
  };
}

function recordAttempt(state: RuntimeState, phase: ModelAttemptPhase): void {
  if (phase === "primary") {
    state.primaryAttempts += 1;
    return;
  }

  state.fallbackAttempts += 1;
}

function createRuntimeInfo(plan: ModelAttemptPlan, state: RuntimeState): ModelRuntimeInfo {
  return {
    // `model` remains the compact business field; `runtime.usedModel` is the structured debug field.
    usedModel: plan.model,
    fallbackUsed: plan.phase === "fallback",
    primaryAttempts: state.primaryAttempts,
    fallbackAttempts: state.fallbackAttempts,
    errors: state.errors,
  };
}

function normalizeMaxRetries(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

function getMaxAttempts(maxRetries: number): number {
  return 1 + maxRetries;
}

function toRuntimeErrorItem(
  error: unknown,
  plan: ModelAttemptPlan,
  attempt: number,
): ModelRuntimeErrorItem {
  return {
    model: plan.model,
    attempt,
    phase: plan.phase,
    message: toSafeErrorMessage(error),
  };
}

function toSafeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function createModelRuntimeError(errors: ModelRuntimeErrorItem[]): ModelRuntimeError {
  return new ModelRuntimeError("Model runtime failed after retry and fallback attempts.", errors);
}
