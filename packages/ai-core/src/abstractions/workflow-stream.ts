/**
 * Workflow 的 Core 级流式协议。
 *
 * 事件描述完整工作流生命周期，而非 HTTP/NDJSON 传输格式。事件可携带 Date、raw、
 * ToolResult 等运行时值；宿主跨网络发送前必须映射为自己的 JSON-safe Wire DTO。
 * 每条流必须以 workflow:finish 或 workflow:error 二选一终止。
 */
import type { ModelToolCall } from "./model";
import type { ToolResult } from "./tool";
import type { ChatWorkflowOutput } from "./workflow";
import type { WorkflowStepName, WorkflowStepStatus } from "./workflow-trace";

export interface WorkflowStartStreamEvent {
  type: "workflow:start";
  workflowId: string;
  timestamp: Date;
}

export interface WorkflowStepStartStreamEvent {
  type: "step:start";
  workflowId: string;
  step: WorkflowStepName;
  timestamp: Date;
}

export interface WorkflowStepEndStreamEvent {
  type: "step:end";
  workflowId: string;
  step: WorkflowStepName;
  timestamp: Date;
  status: WorkflowStepStatus;
  summary?: Record<string, unknown>;
}

export interface WorkflowTextDeltaStreamEvent {
  type: "text:delta";
  workflowId: string;
  text: string;
  model?: string;
}

export interface WorkflowToolCallStreamEvent {
  type: "tool:call";
  workflowId: string;
  call: ModelToolCall;
}

export interface WorkflowToolResultStreamEvent {
  type: "tool:result";
  workflowId: string;
  result: ToolResult;
}

export interface WorkflowFinishStreamEvent {
  type: "workflow:finish";
  workflowId: string;
  output: ChatWorkflowOutput;
}

export interface WorkflowErrorStreamEvent {
  type: "workflow:error";
  workflowId: string;
  error: SafeWorkflowError;
}

/** Core 内部事件联合；text:delta 仅承载最终用户回复，工具事件必须先于首个 delta。 */
export type ChatWorkflowStreamEvent =
  | WorkflowStartStreamEvent
  | WorkflowStepStartStreamEvent
  | WorkflowStepEndStreamEvent
  | WorkflowTextDeltaStreamEvent
  | WorkflowToolCallStreamEvent
  | WorkflowToolResultStreamEvent
  | WorkflowFinishStreamEvent
  | WorkflowErrorStreamEvent;

export type SafeWorkflowErrorCode =
  | "workflow_stream_not_supported"
  | "input_safety_rejected"
  | "output_safety_rejected"
  | "model_stream_failed"
  | "tool_planning_failed"
  | "tool_execution_failed"
  | "post_process_failed"
  | "workflow_failed";

/** 可暴露给宿主的有限错误 DTO；details 只允许 JSON-safe 标量。 */
export interface SafeWorkflowError {
  code: SafeWorkflowErrorCode;
  message: string;
  retryable?: boolean;
  step?: WorkflowStepName;
  details?: Record<string, string | number | boolean | null>;
}
