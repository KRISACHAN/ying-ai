import type {
  WorkflowStepName,
  WorkflowStepStatus,
  WorkflowStepTrace,
  WorkflowTrace,
  WorkflowTraceError,
} from "../../abstractions/workflow-trace";

interface ActiveStep {
  index: number;
  startedAtMs: number;
}

export class WorkflowTraceRecorder {
  private readonly startedAtMs = Date.now();
  private readonly startedAt = new Date(this.startedAtMs).toISOString();
  private readonly steps: WorkflowStepTrace[] = [];

  public readonly workflowId: string;

  public constructor(private readonly budgetMs?: number) {
    this.workflowId = createWorkflowId();
  }

  public start(step: WorkflowStepName): ActiveStep {
    const startedAtMs = Date.now();
    const trace: WorkflowStepTrace = {
      step,
      status: "failed",
      startedAt: new Date(startedAtMs).toISOString(),
    };
    const index = this.steps.push(trace) - 1;

    return { index, startedAtMs };
  }

  public end(
    active: ActiveStep,
    status: WorkflowStepStatus,
    options: {
      summary?: Record<string, unknown>;
      error?: WorkflowTraceError;
    } = {},
  ): WorkflowStepTrace {
    const endedAtMs = Date.now();
    const current = this.steps[active.index];
    const next: WorkflowStepTrace = {
      step: current?.step ?? "prompt:build",
      status,
      startedAt: current?.startedAt ?? new Date(active.startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: Math.max(0, endedAtMs - active.startedAtMs),
      ...(options.summary !== undefined ? { summary: options.summary } : {}),
      ...(options.error !== undefined ? { error: options.error } : {}),
    };

    this.steps[active.index] = next;

    return next;
  }

  public snapshot(status?: WorkflowTrace["status"]): WorkflowTrace {
    const endedAtMs = Date.now();
    const durationMs = Math.max(0, endedAtMs - this.startedAtMs);
    const budgetExceeded = this.budgetMs !== undefined && durationMs > this.budgetMs;
    const traceStatus = status ?? inferTraceStatus(this.steps);

    return {
      workflowId: this.workflowId,
      startedAt: this.startedAt,
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs,
      status: traceStatus,
      ...(this.budgetMs !== undefined ? { budgetMs: this.budgetMs, budgetExceeded } : {}),
      steps: this.steps.map((step) => ({ ...step })),
    };
  }
}

function inferTraceStatus(steps: WorkflowStepTrace[]): WorkflowTrace["status"] {
  if (steps.some((step) => step.status === "failed")) {
    return "degraded";
  }
  if (steps.some((step) => step.status === "degraded")) {
    return "degraded";
  }

  return "success";
}

function createWorkflowId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;

  if (typeof randomUUID === "function") {
    return `wf_${randomUUID.call(globalThis.crypto)}`;
  }

  return `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
