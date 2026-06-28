import type { CoreEvent, CoreObserver } from "../../abstractions/observer";
import type {
  WorkflowStepEventPayload,
  WorkflowStepName,
  WorkflowStepStatus,
} from "../../abstractions/workflow-trace";
import {
  createSafeWorkflowError,
  normalizeSafeWorkflowError,
  toSafeMessage,
  toTraceError,
} from "./workflow-safe-error";
import type { WorkflowStreamEmitter } from "./workflow-stream-emitter";
import type { WorkflowTraceRecorder } from "./workflow-trace-recorder";

export interface RunWorkflowStepOptions<TResult> {
  observer: CoreObserver;
  recorder: WorkflowTraceRecorder;
  streamEmitter?: WorkflowStreamEmitter | undefined;
  workflowStep: WorkflowStepName;
  legacyStep: string;
  sessionId?: string;
  startSummary?: Record<string, unknown>;
  run: () => Promise<TResult>;
  status?: (result: TResult) => WorkflowStepStatus;
  summarize?: (result: TResult) => Record<string, unknown>;
}

export async function runWorkflowStep<TResult>(
  options: RunWorkflowStepOptions<TResult>,
): Promise<TResult> {
  const active = options.recorder.start(options.workflowStep);
  options.streamEmitter?.emitStepStart(options.workflowStep);

  await emitWorkflowStep(options.observer, {
    workflowId: options.recorder.workflowId,
    step: `${options.legacyStep}:start`,
    workflowStep: options.workflowStep,
    phase: "start",
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    ...(options.startSummary !== undefined ? options.startSummary : {}),
    ...(options.startSummary !== undefined ? { summary: options.startSummary } : {}),
  });

  try {
    const result = await options.run();
    const status = options.status?.(result) ?? "success";
    const summary = options.summarize?.(result);
    const traceStep = options.recorder.end(active, status, {
      ...(summary !== undefined ? { summary } : {}),
    });
    options.streamEmitter?.emitStepEnd(options.workflowStep, status, summary);

    await emitWorkflowStep(options.observer, {
      workflowId: options.recorder.workflowId,
      step: `${options.legacyStep}:end`,
      workflowStep: options.workflowStep,
      phase: status === "success" ? "end" : status,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
      ...(traceStep.durationMs !== undefined ? { durationMs: traceStep.durationMs } : {}),
      ...(summary !== undefined ? summary : {}),
      ...(summary !== undefined ? { summary } : {}),
    });

    return result;
  } catch (error) {
    const workflowError =
      options.workflowStep === "tool:execute" && normalizeSafeWorkflowError(error) === null
        ? createSafeWorkflowError({
            code: "tool_execution_failed",
            step: "tool:execute",
            message: "Tool execution failed.",
            details: { reason: toSafeMessage(error) },
          })
        : error;
    const safeError = toTraceError(workflowError);
    const traceStep = options.recorder.end(active, "failed", { error: safeError });
    options.streamEmitter?.emitStepEnd(options.workflowStep, "failed", {
      error: safeError,
    });

    await emitWorkflowStep(options.observer, {
      workflowId: options.recorder.workflowId,
      step: `${options.legacyStep}:failed`,
      workflowStep: options.workflowStep,
      phase: "failed",
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
      ...(traceStep.durationMs !== undefined ? { durationMs: traceStep.durationMs } : {}),
      error: safeError,
    });

    throw workflowError;
  }
}

/**
 * Observer 不得打断主链路：同步异常与异步 rejection 都吞掉。
 */
export async function safeEmit(observer: CoreObserver, event: CoreEvent): Promise<void> {
  try {
    await Promise.resolve(observer.emit(event));
  } catch {
    // Observer 异常不得打断 Workflow
  }
}

async function emitWorkflowStep(
  observer: CoreObserver,
  payload: WorkflowStepEventPayload,
): Promise<void> {
  await safeEmit(observer, {
    type: "workflow:step",
    timestamp: new Date(),
    payload,
  });
}
