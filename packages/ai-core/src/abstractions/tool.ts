/**
 * 工具调用抽象（阶段 6）。
 *
 * ToolRegistry 扩展 ToolProvider，支持 register 注册工具与 handler。
 * Workflow 通过 ToolRegistry 执行规划返回的 toolCalls，再把 ToolResult 拼回最终生成。
 */
import type { CoreProvider } from "./provider";

/** 工具元信息，将注册到模型 tools 入参（阶段 6）。 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: ToolParametersSchema;
  metadata?: ToolDefinitionMetadata;
}

/** Core 自己的工具参数 schema 约定：V1 只支持 object 参数。 */
export interface ToolParametersSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolDefinitionMetadata {
  tags?: string[];
  [key: string]: unknown;
}

/** 模型返回的工具调用请求。 */
export interface ToolCall {
  id?: string;
  name: string;
  arguments: unknown;
}

/** 工具执行结果，供二次 generate 拼入上下文。 */
export interface ToolResult {
  toolCallId?: string;
  name: string;
  result: unknown;
  ok?: boolean;
  error?: ToolExecutionError;
  metadata?: ToolExecutionMetadata;
}

export type ToolExecutionErrorCode =
  | "TOOL_NOT_FOUND"
  | "TOOL_INVALID_ARGUMENTS"
  | "TOOL_EXECUTION_FAILED";

export interface ToolExecutionError {
  code: ToolExecutionErrorCode;
  message: string;
}

export interface ToolExecutionMetadata {
  startedAt?: Date;
  endedAt?: Date;
  durationMs?: number;
  rawArguments?: unknown;
  [key: string]: unknown;
}

export interface ToolExecuteInput {
  call: ToolCall;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/** 工具列出与执行契约（阶段 6 接入 Workflow）。 */
export interface ToolProvider extends CoreProvider {
  list(): Promise<ToolDefinition[]>;
  execute(input: ToolExecuteInput): Promise<ToolResult>;
}

export type ToolHandler = (input: ToolExecuteInput) => Promise<ToolResult>;

/** 可注册工具的 ToolProvider 扩展。 */
export interface ToolRegistry extends ToolProvider {
  register(definition: ToolDefinition, handler: ToolHandler): void;
}
