import type { CoreProvider } from "./provider";

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  id?: string;
  name: string;
  arguments: unknown;
}

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

export interface ToolProvider extends CoreProvider {
  list(): Promise<ToolDefinition[]>;
  execute(input: ToolExecuteInput): Promise<ToolResult>;
}

export type ToolHandler = (input: ToolExecuteInput) => Promise<ToolResult>;

export interface ToolRegistry extends ToolProvider {
  register(definition: ToolDefinition, handler: ToolHandler): void;
}
