import {
  ModelCapabilityUnavailableError,
  ModelRuntimeError,
  modelProfileSatisfiesCapabilities,
  type ChatModel,
  type GenerateInput,
  type GenerateOutput,
  type GenerateStreamChunk,
  type ModelAttemptPhase,
  type ModelCapabilitySkipItem,
  type ModelCapabilities,
  type ModelProfile,
  type ModelRuntimeErrorItem,
  type ModelRuntimeInfo,
  type RequiredModelCapabilities,
} from "@ying-companion/ai-core";
import { Ollama, type ChatRequest, type ChatResponse } from "ollama";

import { toGenerateUsage, toOllamaRequestOptions } from "./ollama-message-mapper";
import {
  DEFAULT_OLLAMA_CAPABILITIES,
  normalizeOllamaOptions,
  type NormalizedOllamaChatModelOptions,
  type OllamaChatModelOptions,
} from "./ollama-options";
import { toModelToolCalls, toOllamaTools } from "./ollama-tool-mapper";

const OLLAMA_PROVIDER = "ollama";
const MAX_ERROR_MESSAGE_LENGTH = 240;

interface OllamaClient {
  chat(request: ChatRequest & { stream: true }): Promise<AsyncIterable<ChatResponse>>;
  chat(request: ChatRequest & { stream?: false }): Promise<ChatResponse>;
}

export class OllamaChatModel implements ChatModel {
  public readonly meta = {
    id: "model.ollama",
    kind: "model",
    name: "Ollama Chat Model",
  } as const;

  public readonly primaryProfile: ModelProfile;
  public readonly fallbackProfile?: ModelProfile;

  private readonly options: NormalizedOllamaChatModelOptions;
  private readonly client: OllamaClient;

  public constructor(options: OllamaChatModelOptions, client?: OllamaClient) {
    this.options = normalizeOllamaOptions(options);
    this.primaryProfile = createModelProfile(
      this.options.model,
      this.options.primaryProfileOverride?.capabilities,
    );

    if (this.options.fallback !== undefined) {
      this.fallbackProfile = createModelProfile(
        this.options.fallback.model,
        this.options.fallback.profileOverride?.capabilities,
      );
    }

    this.client = client ?? new Ollama({ host: this.options.host });
  }

  public async generate(input: GenerateInput): Promise<GenerateOutput> {
    const state = createRuntimeState();
    const requiredCapabilities = mergeRequiredCapabilities(
      input.requiredCapabilities,
      toolsRequireToolCalling(input.tools),
    );

    for (const plan of this.createAttemptPlans(requiredCapabilities, state)) {
      for (let attempt = 1; attempt <= getMaxAttempts(this.options.maxRetries); attempt += 1) {
        recordAttempt(state, plan.phase);

        try {
          const output = await this.generateOnce(input, plan);
          validateGenerateOutput(output);

          return {
            ...output,
            runtime: createRuntimeInfo(plan, state),
          };
        } catch (error) {
          state.errors.push(toRuntimeErrorItem(error, plan, attempt));
          await this.sleepBeforeRetry(attempt);
        }
      }
    }

    throw createFinalModelError(requiredCapabilities, state);
  }

  public async *stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk> {
    const state = createRuntimeState();
    const requiredCapabilities = mergeRequiredCapabilities(input.requiredCapabilities, {
      ...toolsRequireToolCalling(input.tools),
      streaming: true,
    });
    const streamInput: GenerateInput = {
      ...input,
      requiredCapabilities,
    };

    for (const plan of this.createAttemptPlans(requiredCapabilities, state)) {
      for (let attempt = 1; attempt <= getMaxAttempts(this.options.maxRetries); attempt += 1) {
        recordAttempt(state, plan.phase);
        let hasYieldedText = false;
        let lastPart: ChatResponse | undefined;

        try {
          const response = await this.client.chat({
            ...this.createChatRequest(streamInput, plan),
            stream: true,
          });

          for await (const part of response) {
            lastPart = part;
            const text = part.message.content ?? "";

            if (text.length > 0) {
              hasYieldedText = true;
            }

            yield {
              text,
              model: plan.model,
              raw: part,
            };
          }

          const finishChunk: GenerateStreamChunk = {
            text: "",
            model: plan.model,
            raw: lastPart ?? { provider: OLLAMA_PROVIDER, event: "finish" },
            runtime: createRuntimeInfo(plan, state),
          };
          const usage = lastPart === undefined ? undefined : toGenerateUsage(lastPart);

          if (usage !== undefined) {
            finishChunk.usage = usage;
          }

          yield finishChunk;
          return;
        } catch (error) {
          state.errors.push(toRuntimeErrorItem(error, plan, attempt));

          if (hasYieldedText) {
            throw createModelRuntimeError(state);
          }

          await this.sleepBeforeRetry(attempt);
        }
      }
    }

    throw createFinalModelError(requiredCapabilities, state);
  }

  private async generateOnce(
    input: GenerateInput,
    plan: ModelAttemptPlan,
  ): Promise<GenerateOutput> {
    const response = await this.client.chat({
      ...this.createChatRequest(input, plan),
      stream: false,
    });
    const output: GenerateOutput = {
      text: response.message.content ?? "",
      model: plan.model,
      raw: response,
    };
    const usage = toGenerateUsage(response);
    const toolCalls = toModelToolCalls(response.message.tool_calls);

    if (usage !== undefined) {
      output.usage = usage;
    }

    if (toolCalls !== undefined) {
      output.toolCalls = toolCalls;
    }

    if (input.structuredOutput !== undefined) {
      output.structuredOutput = input.structuredOutput.schema.parse(
        parseStructuredJson(output.text),
      );
    }

    return output;
  }

  private createChatRequest(input: GenerateInput, plan: ModelAttemptPlan): ChatRequest {
    const request: ChatRequest = {
      model: plan.model,
      ...toOllamaRequestOptions(input, this.options.keepAlive),
    };
    const tools = toOllamaTools(input.tools);

    if (tools !== undefined) {
      if (!plan.profile.capabilities.toolCalling) {
        throw new ModelCapabilityUnavailableError(
          "Ollama model candidate does not satisfy tool calling capability.",
          { toolCalling: true },
          [createCapabilitySkip(plan.profile, { toolCalling: true })],
        );
      }

      request.tools = tools;
    }

    return request;
  }

  private createAttemptPlans(
    requiredCapabilities: RequiredModelCapabilities,
    state: RuntimeState,
  ): ModelAttemptPlan[] {
    const plans: ModelAttemptPlan[] = [];
    const primaryPlan: ModelAttemptPlan = {
      phase: "primary",
      model: this.primaryProfile.model,
      profile: this.primaryProfile,
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

  private async sleepBeforeRetry(attempt: number): Promise<void> {
    if (attempt >= getMaxAttempts(this.options.maxRetries) || this.options.retryDelayMs === 0) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, this.options.retryDelayMs);
    });
  }
}

function parseStructuredJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const fencedJson = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text.trim());
    if (fencedJson?.[1] === undefined) {
      throw error;
    }
    return JSON.parse(fencedJson[1]) as unknown;
  }
}

export function createOllamaChatModel(options: OllamaChatModelOptions): ChatModel {
  return new OllamaChatModel(options);
}

interface ModelAttemptPlan {
  phase: ModelAttemptPhase;
  model: string;
  profile: ModelProfile;
}

interface RuntimeState {
  primaryAttempts: number;
  fallbackAttempts: number;
  errors: ModelRuntimeErrorItem[];
  capabilitySkips: ModelCapabilitySkipItem[];
}

function createModelProfile(
  model: string,
  capabilityOverride: Partial<ModelCapabilities> | undefined,
): ModelProfile {
  return {
    provider: OLLAMA_PROVIDER,
    model,
    capabilities: {
      ...DEFAULT_OLLAMA_CAPABILITIES,
      ...(capabilityOverride ?? {}),
    },
  };
}

function createRuntimeState(): RuntimeState {
  return {
    primaryAttempts: 0,
    fallbackAttempts: 0,
    errors: [],
    capabilitySkips: [],
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
  const runtime: ModelRuntimeInfo = {
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

function getMaxAttempts(maxRetries: number): number {
  return 1 + maxRetries;
}

function validateGenerateOutput(output: GenerateOutput): void {
  if (
    !output.text.trim() &&
    output.structuredOutput === undefined &&
    (output.toolCalls?.length ?? 0) === 0
  ) {
    throw new Error("Ollama model output is empty");
  }
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

function createModelRuntimeError(state: RuntimeState): ModelRuntimeError {
  return new ModelRuntimeError(
    "Ollama model runtime failed after retry and fallback attempts.",
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
      "No Ollama model candidate satisfies the required capabilities.",
      requiredCapabilities,
      state.capabilitySkips,
    );
  }

  return createModelRuntimeError(state);
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

function mergeRequiredCapabilities(
  first: RequiredModelCapabilities | undefined,
  second: RequiredModelCapabilities,
): RequiredModelCapabilities {
  return {
    ...(first ?? {}),
    ...second,
  };
}

function toolsRequireToolCalling(
  tools: Record<string, unknown> | undefined,
): RequiredModelCapabilities {
  return tools !== undefined && Object.keys(tools).length > 0 ? { toolCalling: true } : {};
}
