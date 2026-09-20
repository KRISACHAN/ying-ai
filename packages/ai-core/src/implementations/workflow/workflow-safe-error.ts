/**
 * Workflow 错误的安全边界。
 *
 * SimpleChatWorkflow 的内部异常在进入 Stream/Trace 等宿主可见通道前收敛为固定错误码
 * 与脱敏短消息。受控错误的 details 契约只允许有限标量；底层 Error、堆栈、连接串和
 * 凭据不得由本模块主动穿过该边界。
 */
import type { SafeWorkflowError, SafeWorkflowErrorCode } from "../../abstractions/workflow-stream";
import type { WorkflowStepName, WorkflowTraceError } from "../../abstractions/workflow-trace";

export interface CreateSafeWorkflowErrorOptions {
  code: SafeWorkflowErrorCode;
  message: string;
  retryable?: boolean;
  step?: WorkflowStepName;
  details?: Record<string, string | number | boolean | null> | undefined;
}

/** 创建既可抛出又符合 SafeWorkflowError DTO 形状的受控异常。 */
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

/** 保留已受控错误；未知异常统一映射为 workflow_failed。 */
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

/** 仅接受冻结错误码与字符串 message，防止任意对象被误当作安全错误透传。 */
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
