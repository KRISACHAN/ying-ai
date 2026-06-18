/**
 * 模型运行时抽象（阶段 1）。
 *
 * ChatModel 是 Core 与 LLM 之间的唯一边界：Workflow 不直接调用 OpenAI，
 * 只通过 generate / stream 与模型交互。toolCalls 结构已预留，执行循环在阶段 6 接入。
 */
import type { CoreProvider } from "./provider";

export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

/** 单条对话消息；tool 角色消息由 Workflow 在工具二次生成时构造。 */
export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ModelToolCall[];
}

/** 模型 generate / stream 的输入。 */
export interface GenerateInput {
  messages: ChatMessage[];
  /**
   * Core 工具定义经实现层适配后的模型工具集合。
   */
  tools?: Record<string, unknown>;
  /** 单次调用的主模型覆盖；不影响 factory 配置的 fallbackModel。 */
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/** Token 用量统计（来自 AI SDK usage）。 */
export interface GenerateUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** 非流式生成的完整结果。 */
export interface GenerateOutput {
  text: string;
  model: string;
  raw: unknown;
  toolCalls?: ModelToolCall[];
  usage?: GenerateUsage;
  runtime?: ModelRuntimeInfo;
}

/** 模型返回的工具调用请求（阶段 6 前由 Workflow 忽略）。 */
export interface ModelToolCall {
  id?: string;
  name: string;
  arguments: unknown;
}

/** 流式生成的单个增量块；最后一个块可携带 usage 与 runtime。 */
export interface GenerateStreamChunk {
  text: string;
  model?: string;
  raw: unknown;
  usage?: GenerateUsage;
  runtime?: ModelRuntimeInfo;
}

/** 模型运行时契约：generate 与 stream 的统一入口。 */
export interface ChatModel extends CoreProvider {
  generate(input: GenerateInput): Promise<GenerateOutput>;
  stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk>;
}

/** 重试/降级过程的结构化调试信息。 */
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

/** 单次失败尝试的安全错误摘要。 */
export interface ModelRuntimeErrorItem {
  model: string;
  attempt: number;
  phase: ModelAttemptPhase;
  message: string;
}

/** 主模型或降级模型阶段。 */
export type ModelAttemptPhase = "primary" | "fallback";
