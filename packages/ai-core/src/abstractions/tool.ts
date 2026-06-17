/**
 * 工具调用抽象（阶段 6 接入 Workflow）。
 *
 * ToolRegistry 扩展 ToolProvider，支持 register 注册工具与 handler。
 * 当前默认 EmptyToolRegistry 占位；Workflow 尚未执行 model 返回的 toolCalls。
 */
import type { CoreProvider } from "./provider";

/** 工具元信息，将注册到模型 tools 入参（阶段 6）。 */
export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
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
