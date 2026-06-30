/**
 * OpenAI-compatible 模型实现（阶段 1）。
 *
 * 基于 Vercel AI SDK（@ai-sdk/openai-compatible + ai）适配，
 * 支持 generate / stream、主模型重试、降级模型与运行时元信息。
 * 不直接依赖 OpenAI 官方 SDK，也不读取环境变量。
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  generateText,
  Output as AiOutput,
  streamText,
  type LanguageModelUsage,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type TypedToolCall,
} from "ai";

import { ModelRuntimeError } from "../../errors/model-runtime-error";
import { ModelCapabilityUnavailableError } from "../../errors/model-capability-unavailable-error";
import {
  modelProfileSatisfiesCapabilities,
  type ChatMessage,
  type ChatModel,
  type GenerateInput,
  type GenerateOutput,
  type GenerateStreamChunk,
  type GenerateUsage,
  type ModelAttemptPhase,
  type ModelCapabilities,
  type ModelCapabilitySkipItem,
  type ModelProfile,
  type ModelRuntimeErrorItem,
  type ModelRuntimeInfo,
  type ModelToolCall,
  type RequiredModelCapabilities,
} from "../../abstractions/model";
import type { OpenAICompatibleConfig } from "../../config/model-config";

const DEFAULT_PRIMARY_MAX_RETRIES = 0;
const DEFAULT_FALLBACK_MAX_RETRIES = 0;
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_COMPATIBLE_PROVIDER = "openai-compatible";
const DEFAULT_OPENAI_COMPATIBLE_CAPABILITIES: ModelCapabilities = {
  streaming: true,
  toolCalling: false,
  usage: false,
};
/** 写入 runtime.errors 的单条错误消息上限，避免日志膨胀。 */
const MAX_ERROR_MESSAGE_LENGTH = 240;

export class OpenAICompatibleModel implements ChatModel {
  public readonly meta = {
    id: "model.openai-compatible",
    kind: "model",
    name: "OpenAI Compatible Model",
  } as const;

  private readonly config: OpenAICompatibleConfig;
  private readonly provider: ReturnType<typeof createOpenAICompatible>;
  public readonly primaryProfile: ModelProfile;
  public readonly fallbackProfile?: ModelProfile;

  public constructor(config: OpenAICompatibleConfig) {
    this.config = config;
    this.primaryProfile = createModelProfile(config.model, config.primaryProfileOverride);

    if (config.fallbackModel !== undefined && config.fallbackModel.trim() !== "") {
      this.fallbackProfile = createModelProfile(
        config.fallbackModel,
        config.fallbackProfileOverride,
      );
    }

    // 模型实例配置不可变，重试循环复用同一 provider 工厂。
    this.provider = createOpenAICompatible({
      name: "openai-compatible",
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl ?? DEFAULT_OPENAI_BASE_URL,
      includeUsage: true,
    });
  }

  /** 非流式生成：按主模型 → 降级模型顺序重试，成功时附带 runtime 元信息。 */
  public async generate(input: GenerateInput): Promise<GenerateOutput> {
    const state = createRuntimeState();
    const requiredCapabilities = input.requiredCapabilities ?? {};

    for (const plan of this.createAttemptPlans(requiredCapabilities, state)) {
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

    throw createFinalModelError(requiredCapabilities, state);
  }

  /**
   * 流式生成：仅在尚未向调用方 yield 文本时可切换降级模型；
   * 一旦开始吐字，后续错误直接抛出（V1 不在流中途切换模型）。
   */
  public async *stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk> {
    const state = createRuntimeState();
    const requiredCapabilities = mergeRequiredCapabilities(input.requiredCapabilities, {
      streaming: true,
    });
    const streamInput: GenerateInput = {
      ...input,
      requiredCapabilities,
    };

    for (const plan of this.createAttemptPlans(requiredCapabilities, state)) {
      for (let attempt = 1; attempt <= getMaxAttempts(plan.maxRetries); attempt++) {
        recordAttempt(state, plan.phase);
        let hasYieldedText = false;

        try {
          const result = streamText(this.createTextOptions(streamInput, plan.model));

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
            throw createModelRuntimeError(state);
          }
        }
      }
    }

    throw createFinalModelError(requiredCapabilities, state);
  }

  /** 组装 AI SDK generateText/streamText 参数。 */
  private createTextOptions(input: GenerateInput, model: string): TextOptions {
    const options: TextOptions = {
      model: this.provider(model),
      messages: toAiSdkMessages(input.messages),
      maxRetries: 0,
    };

    if (input.tools !== undefined) {
      options.tools = input.tools as ToolSet;
    }

    if (input.temperature !== undefined) {
      options.temperature = input.temperature;
    }

    if (input.maxTokens !== undefined) {
      options.maxOutputTokens = input.maxTokens;
    }

    if (input.structuredOutput?.type === "object") {
      options.output = AiOutput.object({
        schema: input.structuredOutput.schema,
        ...(input.structuredOutput.name !== undefined ? { name: input.structuredOutput.name } : {}),
        ...(input.structuredOutput.description !== undefined
          ? { description: input.structuredOutput.description }
          : {}),
      });
    }

    return options;
  }

  /** 单次 generateText 调用，映射为 Core 的 GenerateOutput。 */
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

    if (input.structuredOutput !== undefined) {
      output.structuredOutput = result.output;
    }

    return output;
  }

  /** 构建主模型与可选降级模型的尝试计划。 */
  private createAttemptPlans(
    requiredCapabilities: RequiredModelCapabilities,
    state: RuntimeState,
  ): ModelAttemptPlan[] {
    const plans: ModelAttemptPlan[] = [];
    const primaryPlan: ModelAttemptPlan = {
      phase: "primary",
      model: this.primaryProfile.model,
      profile: this.primaryProfile,
      maxRetries: normalizeMaxRetries(
        this.config.retry?.primaryMaxRetries,
        DEFAULT_PRIMARY_MAX_RETRIES,
      ),
    };

    if (modelProfileSatisfiesCapabilities(this.primaryProfile, requiredCapabilities)) {
      plans.push(primaryPlan);
    } else {
      state.capabilitySkips.push(createCapabilitySkip(this.primaryProfile, requiredCapabilities));
    }

    if (this.fallbackProfile !== undefined) {
      const fallbackPlan: ModelAttemptPlan = {
        phase: "fallback",
        model: this.fallbackProfile.model,
        profile: this.fallbackProfile,
        maxRetries: normalizeMaxRetries(
          this.config.retry?.fallbackMaxRetries,
          DEFAULT_FALLBACK_MAX_RETRIES,
        ),
      };

      if (modelProfileSatisfiesCapabilities(this.fallbackProfile, requiredCapabilities)) {
        plans.push(fallbackPlan);
      } else {
        state.capabilitySkips.push(
          createCapabilitySkip(this.fallbackProfile, requiredCapabilities),
        );
      }
    }

    return plans;
  }
}

/** AI SDK generateText/streamText 的入参形状。 */
interface TextOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  tools?: ToolSet;
  output?: ReturnType<typeof AiOutput.object>;
  temperature?: number;
  maxOutputTokens?: number;
  maxRetries: number;
}

/** 单次模型尝试计划：阶段（主/降级）、模型名、最大重试次数。 */
interface ModelAttemptPlan {
  phase: ModelAttemptPhase;
  model: string;
  profile: ModelProfile;
  maxRetries: number;
}

/** 跨重试循环累积的运行时状态。 */
interface RuntimeState {
  primaryAttempts: number;
  fallbackAttempts: number;
  errors: ModelRuntimeErrorItem[];
  capabilitySkips: ModelCapabilitySkipItem[];
}

/** 将 Core ChatMessage 转为 AI SDK ModelMessage。 */
function toAiSdkMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((message): ModelMessage => {
    if (message.role === "assistant" && (message.toolCalls?.length ?? 0) > 0) {
      const content = [];

      if (message.content.trim() !== "") {
        content.push({ type: "text" as const, text: message.content });
      }

      for (const toolCall of message.toolCalls ?? []) {
        content.push({
          type: "tool-call" as const,
          toolCallId: toolCall.id ?? "",
          toolName: toolCall.name,
          input: toolCall.arguments,
        });
      }

      return {
        role: "assistant",
        content,
      };
    }

    if (message.role === "tool") {
      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: message.toolCallId ?? "",
            toolName: message.name ?? "unknown_tool",
            output: {
              type: "text",
              value: message.content,
            },
          },
        ],
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
}

/** 拒绝空文本且无 toolCalls 的模型输出。 */
function validateGenerateOutput(output: GenerateOutput): void {
  if (!output.text.trim() && (output.toolCalls?.length ?? 0) === 0) {
    throw new Error("Model output is empty");
  }
}

/** 将 AI SDK LanguageModelUsage 映射为 Core GenerateUsage。 */
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

/** 将 AI SDK TypedToolCall 映射为 Core ModelToolCall。 */
function toModelToolCalls(toolCalls: Array<TypedToolCall<ToolSet>>): ModelToolCall[] | undefined {
  if (toolCalls.length === 0) {
    return undefined;
  }

  return toolCalls.map((toolCall) => ({
    id: toolCall.toolCallId,
    name: toolCall.toolName,
    arguments: toolCall.input,
  }));
}

/** 初始化重试计数器与错误列表。 */
function createRuntimeState(): RuntimeState {
  return {
    primaryAttempts: 0,
    fallbackAttempts: 0,
    errors: [],
    capabilitySkips: [],
  };
}

/** 按阶段累加主模型或降级模型的尝试次数。 */
function recordAttempt(state: RuntimeState, phase: ModelAttemptPhase): void {
  if (phase === "primary") {
    state.primaryAttempts += 1;
    return;
  }

  state.fallbackAttempts += 1;
}

/** 组装写入 GenerateOutput.runtime 的结构化元信息。 */
function createRuntimeInfo(plan: ModelAttemptPlan, state: RuntimeState): ModelRuntimeInfo {
  const runtime: ModelRuntimeInfo = {
    // GenerateOutput.model 为紧凑业务字段；runtime.usedModel 供调试面板结构化展示。
    usedModel: plan.model,
    fallbackUsed: plan.phase === "fallback",
    primaryAttempts: state.primaryAttempts,
    fallbackAttempts: state.fallbackAttempts,
    errors: state.errors,
    usedProfile: plan.profile,
  };

  if (state.capabilitySkips.length > 0) {
    runtime.capabilitySkips = state.capabilitySkips;
  }

  return runtime;
}

/** 规范化重试次数：非有限数回退默认值，负数截断为 0。 */
function normalizeMaxRetries(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

/** 总尝试次数 = 1 次初始调用 + maxRetries 次重试。 */
function getMaxAttempts(maxRetries: number): number {
  return 1 + maxRetries;
}

/** 将单次失败转为可序列化的运行时错误项。 */
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

/** 截断并规范化错误消息，避免写入过长或含换行的摘要。 */
function toSafeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

/** 主模型与降级模型全部失败后抛出的统一错误。 */
function createModelRuntimeError(state: RuntimeState): ModelRuntimeError {
  return new ModelRuntimeError(
    "Model runtime failed after retry and fallback attempts.",
    state.errors,
    state.capabilitySkips,
  );
}

function createFinalModelError(
  requiredCapabilities: RequiredModelCapabilities,
  state: RuntimeState,
): Error {
  if (state.errors.length > 0) {
    return createModelRuntimeError(state);
  }

  if (state.capabilitySkips.length > 0) {
    return new ModelCapabilityUnavailableError(
      "No model candidate satisfies the required capabilities.",
      requiredCapabilities,
      state.capabilitySkips,
    );
  }

  return createModelRuntimeError(state);
}

function createModelProfile(
  model: string,
  override: OpenAICompatibleConfig["primaryProfileOverride"],
): ModelProfile {
  return {
    provider: OPENAI_COMPATIBLE_PROVIDER,
    model,
    capabilities: {
      ...DEFAULT_OPENAI_COMPATIBLE_CAPABILITIES,
      ...(override?.capabilities ?? {}),
    },
  };
}

function mergeRequiredCapabilities(
  first: RequiredModelCapabilities | undefined,
  second: RequiredModelCapabilities,
): RequiredModelCapabilities {
  return {
    ...(first ?? {}),
    ...second,
  };
}

function createCapabilitySkip(
  profile: ModelProfile,
  requiredCapabilities: RequiredModelCapabilities,
): ModelCapabilitySkipItem {
  return {
    profile,
    requiredCapabilities,
    reason: "capability_unavailable",
  };
}
