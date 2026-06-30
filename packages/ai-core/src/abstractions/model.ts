/**
 * 模型运行时抽象（阶段 1）。
 *
 * ChatModel 是 Core 与 LLM 之间的唯一边界：Workflow 不直接调用 OpenAI，
 * 只通过 generate / stream 与模型交互。toolCalls 结构已预留，执行循环在阶段 6 接入。
 */
import type { CoreProvider } from "./provider";
import type { z } from "zod";

export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

/** 单条对话消息；tool 角色消息由 Workflow 在工具执行后构造。 */
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
  temperature?: number;
  maxTokens?: number;
  /**
   * 请求模型生成经过 schema 校验的结构化对象。
   * Adapter 收到该字段时必须填充 GenerateOutput.structuredOutput，或显式抛出不支持结构化输出的错误。
   */
  structuredOutput?: GenerateStructuredOutput;
  /** 本次调用必须满足的模型能力；未声明时保持 V1.0 兼容行为。 */
  requiredCapabilities?: RequiredModelCapabilities;
}

export interface GenerateStructuredOutput {
  type: "object";
  schema: z.ZodType<unknown>;
  name?: string;
  description?: string;
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
  structuredOutput?: unknown;
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
  readonly primaryProfile: ModelProfile;
  readonly fallbackProfile?: ModelProfile;

  generate(input: GenerateInput): Promise<GenerateOutput>;
  stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk>;
}

/** 具体模型的能力声明。能力属于模型候选，不属于 provider 名称。 */
export interface ModelCapabilities {
  /** 是否能输出可消费的连续文本增量。 */
  streaming: boolean;
  /** 是否支持 V1.1 工具规划所需的工具调用能力。 */
  toolCalling: boolean;
  /** 是否能稳定返回 token usage。未知或不稳定时为 false。 */
  usage: boolean;
}

/** 一次可调用的具体模型档案。 */
export interface ModelProfile {
  /** Provider 标识仅用于 runtime / UI 展示，不得作为 Workflow 分支条件。 */
  provider: string;
  /** 具体模型标识，例如 gpt-5 或 qwen3:8b。 */
  model: string;
  capabilities: ModelCapabilities;
}

/** 宿主只能覆盖能力字段，不能覆盖 provider/model。 */
export interface ModelProfileOverride {
  capabilities?: Partial<ModelCapabilities>;
}

/** 本次调用要求的能力集合。true 表示必须满足。 */
export interface RequiredModelCapabilities {
  streaming?: true;
  toolCalling?: true;
  usage?: true;
}

export function modelProfileSatisfiesCapabilities(
  profile: ModelProfile,
  requiredCapabilities: RequiredModelCapabilities,
): boolean {
  return (
    (requiredCapabilities.streaming !== true || profile.capabilities.streaming) &&
    (requiredCapabilities.toolCalling !== true || profile.capabilities.toolCalling) &&
    (requiredCapabilities.usage !== true || profile.capabilities.usage)
  );
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
  /** 本次真正完成调用的模型档案。 */
  usedProfile?: ModelProfile;
  /** 因不满足 requiredCapabilities 而未被调用的候选。 */
  capabilitySkips?: ModelCapabilitySkipItem[];
}

export interface ModelCapabilitySkipItem {
  profile: ModelProfile;
  requiredCapabilities: RequiredModelCapabilities;
  reason: "capability_unavailable";
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
