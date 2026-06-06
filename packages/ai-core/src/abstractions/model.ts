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
}

export interface ChatModel {
  generate(input: GenerateInput): Promise<GenerateOutput>;
  stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk>;
}
