/**
 * Workflow stream protocol.
 *
 * These events are Core business events for streamWorkflow(). HTTP hosts must map
 * them to their own JSON-safe wire DTOs before crossing a network boundary.
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

export interface SafeWorkflowError {
  code: SafeWorkflowErrorCode;
  message: string;
  retryable?: boolean;
  step?: WorkflowStepName;
  details?: Record<string, string | number | boolean | null>;
}
