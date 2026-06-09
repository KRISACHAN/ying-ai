import type { CoreProvider } from "./provider";

export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
  name?: string;
}

export interface GenerateInput {
  messages: ChatMessage[];
  /**
   * TODO(stage-tool-system): Define and validate Core-level tool descriptors before adapting to AI SDK ToolSet.
   * Stage 1 keeps this field as a forward-compatible contract placeholder and does not execute tools.
   */
  tools?: Record<string, unknown>;
  /**
   * Optional per-call primary model override. It does not override the configured fallback model.
   */
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface GenerateOutput {
  text: string;
  model: string;
  raw: unknown;
  toolCalls?: ModelToolCall[];
  usage?: GenerateUsage;
  runtime?: ModelRuntimeInfo;
}

export interface ModelToolCall {
  name: string;
  arguments: unknown;
}

export interface GenerateStreamChunk {
  text: string;
  model?: string;
  raw: unknown;
  usage?: GenerateUsage;
  runtime?: ModelRuntimeInfo;
}

export interface ChatModel extends CoreProvider {
  generate(input: GenerateInput): Promise<GenerateOutput>;
  stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk>;
}

export interface ModelRuntimeInfo {
  /**
   * 本次最终使用的模型。它与 GenerateOutput.model 冗余，但便于调试面板结构化展示。
   */
  usedModel: string;
  fallbackUsed: boolean;
  primaryAttempts: number;
  fallbackAttempts: number;
  errors: ModelRuntimeErrorItem[];
}

export interface ModelRuntimeErrorItem {
  model: string;
  attempt: number;
  phase: ModelAttemptPhase;
  message: string;
}

export type ModelAttemptPhase = "primary" | "fallback";
