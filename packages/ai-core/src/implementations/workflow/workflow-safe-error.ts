import type { SafeWorkflowError, SafeWorkflowErrorCode } from "../../abstractions/workflow-stream";
import type { WorkflowStepName, WorkflowTraceError } from "../../abstractions/workflow-trace";

export interface CreateSafeWorkflowErrorOptions {
  code: SafeWorkflowErrorCode;
  message: string;
  retryable?: boolean;
  step?: WorkflowStepName;
  details?: Record<string, string | number | boolean | null> | undefined;
}

export function createSafeWorkflowError(
  options: CreateSafeWorkflowErrorOptions,
): SafeWorkflowError {
  return new SafeWorkflowException(options);
}

class SafeWorkflowException extends Error implements SafeWorkflowError {
  public readonly code: SafeWorkflowErrorCode;
  public readonly retryable: boolean;
  public readonly step?: WorkflowStepName;
  public readonly details?: Record<string, string | number | boolean | null>;

  public constructor(options: CreateSafeWorkflowErrorOptions) {
    super(redactSensitiveMessage(options.message));
    this.name = "SafeWorkflowError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;

    if (options.step !== undefined) {
      this.step = options.step;
    }

    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

export function toSafeWorkflowError(error: unknown): SafeWorkflowError {
  const normalized = normalizeSafeWorkflowError(error);

  if (normalized !== null) {
    return normalized;
  }

  return createSafeWorkflowError({
    code: "workflow_failed",
    message: toSafeMessage(error),
  });
}

export function normalizeSafeWorkflowError(error: unknown): SafeWorkflowError | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const candidate = error as Partial<SafeWorkflowError>;

  if (!isSafeWorkflowErrorCode(candidate.code) || typeof candidate.message !== "string") {
    return null;
  }

  return {
    code: candidate.code,
    message: redactSensitiveMessage(candidate.message),
    retryable: candidate.retryable ?? false,
    ...(candidate.step !== undefined ? { step: candidate.step } : {}),
    ...(candidate.details !== undefined ? { details: candidate.details } : {}),
  };
}

function isSafeWorkflowErrorCode(code: unknown): code is SafeWorkflowErrorCode {
  return (
    code === "workflow_stream_not_supported" ||
    code === "input_safety_rejected" ||
    code === "output_safety_rejected" ||
    code === "model_stream_failed" ||
    code === "tool_planning_failed" ||
    code === "tool_execution_failed" ||
    code === "post_process_failed" ||
    code === "workflow_failed"
  );
}

/**
 * 只暴露安全的错误摘要，不透传底层错误对象。
 */
export function toSafeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "SimpleChatWorkflow execution failed";
  return redactSensitiveMessage(message);
}

export function toTraceError(error: unknown): WorkflowTraceError {
  return { message: toSafeMessage(error) };
}

function redactSensitiveMessage(message: string): string {
  const redacted = message
    .replace(/\b(?:postgres(?:ql)?|mysql|mongodb):\/\/\S+/gi, "[redacted-connection-string]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /\b(api[_-]?key|token|secret|password)=([^&\s]+)/gi,
      (_match, key: string) => `${key}=[redacted]`,
    );

  return redacted.length > 300 ? `${redacted.slice(0, 297)}...` : redacted;
}
