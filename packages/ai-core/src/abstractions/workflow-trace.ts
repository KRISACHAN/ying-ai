/**
 * Workflow Trace 契约。
 *
 * Trace 是一次执行的结构化诊断快照，不是流式事件或网络 DTO。步骤顺序由实际编排
 * 决定；status=degraded 表示主回复可继续但某个可恢复能力失败或被降级。
 */

/** 可被 Trace、Observer 与 Stream 共同引用的稳定步骤名称。 */
export type WorkflowStepName =
  | "persona:load"
  | "safety:input"
  | "summary:load"
  | "memory:recall"
  | "emotion:analyze"
  | "tool:list"
  | "tool:plan"
  | "prompt:build"
  | "model:generate"
  | "model:stream"
  | "model:follow-up-generate"
  | "tool:execute"
  | "safety:output"
  | "summary:save"
  | "memory:extract"
  | "memory:save";

export type WorkflowStepStatus = "success" | "skipped" | "failed" | "degraded";

export interface WorkflowTraceError {
  code?: string;
  message: string;
}

export interface WorkflowStepTrace {
  step: WorkflowStepName;
  status: WorkflowStepStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  summary?: Record<string, unknown>;
  error?: WorkflowTraceError;
}

export interface WorkflowTrace {
  workflowId: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: "success" | "failed" | "degraded";
  budgetMs?: number;
  budgetExceeded?: boolean;
  steps: WorkflowStepTrace[];
}

export interface WorkflowStepEventPayload {
  workflowId: string;
  step: string;
  workflowStep?: WorkflowStepName;
  phase: "start" | "end" | "skipped" | "failed" | "degraded";
  sessionId?: string;
  durationMs?: number;
  summary?: Record<string, unknown>;
  error?: WorkflowTraceError;
}

export interface WorkflowErrorEventPayload {
  workflowId: string;
  sessionId?: string;
  message: string;
  trace?: WorkflowTrace;
}
