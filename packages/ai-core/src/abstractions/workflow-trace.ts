/** Workflow 级步骤名称。 */
export type WorkflowStepName =
  | "persona:load"
  | "safety:input"
  | "summary:load"
  | "memory:recall"
  | "emotion:analyze"
  | "tool:list"
  | "prompt:build"
  | "model:generate"
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
