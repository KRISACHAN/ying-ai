/**
 * 工具调用抽象。
 *
 * ToolRegistry 扩展 ToolProvider，支持 register 注册工具与 handler。
 * Workflow 通过 ToolRegistry 执行规划返回的 toolCalls，再把 ToolResult 作为最终回答上下文。
 * 工具的注册、执行副作用与权限由宿主实现；Core 只定义调用契约与编排顺序。
 */
import type { CoreProvider } from "./provider";

/** 工具元信息；Workflow 会在规划调用前适配为模型工具描述。 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: ToolParametersSchema;
  metadata?: ToolDefinitionMetadata;
}

/** Core 的工具参数 schema 约定；当前公开契约只支持 object 参数。 */
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

/** 工具执行结果；Workflow 将其作为最终回答的模型上下文。 */
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

/** 工具列出与执行契约；具体副作用与权限校验由实现负责。 */
export interface ToolProvider extends CoreProvider {
  list(): Promise<ToolDefinition[]>;
  execute(input: ToolExecuteInput): Promise<ToolResult>;
}

export type ToolHandler = (input: ToolExecuteInput) => Promise<ToolResult>;

/** 可注册工具的 ToolProvider 扩展。 */
export interface ToolRegistry extends ToolProvider {
  register(definition: ToolDefinition, handler: ToolHandler): void;
}
