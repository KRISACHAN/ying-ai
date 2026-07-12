import type { ChatWorkflowStreamWireEvent } from "./chat-stream-wire";

export type DemoTurnStatus =
  | "idle"
  | "submitted"
  | "planning_tool"
  | "searching"
  | "streaming"
  | "success"
  | "degraded"
  | "partial_failed"
  | "output_safety_rejected"
  | "persistence_failed"
  | "tool_failed"
  | "cancelled"
  | "failed";

export interface DemoChatErrorMetadata {
  status: DemoTurnStatus;
  code: string;
  message: string;
  reason?: string;
}

export function hasDegradedTrace(trace: unknown): boolean {
  if (typeof trace !== "object" || trace === null) {
    return false;
  }

  const maybeTrace = trace as { status?: unknown; steps?: Array<{ status?: unknown }> };
  return (
    maybeTrace.status === "degraded" ||
    maybeTrace.steps?.some((step) => step.status === "degraded") === true
  );
}

export function mapWorkflowErrorStatus(
  event: Extract<ChatWorkflowStreamWireEvent, { type: "workflow:error" }>,
  deltaText: string,
): DemoTurnStatus {
  if (event.error.code === "output_safety_rejected") {
    return "output_safety_rejected";
  }
  if (
    event.error.code === "workflow_failed" &&
    event.error.details?.reason === "persistence_failed"
  ) {
    return "persistence_failed";
  }

  return deltaText.length > 0 ? "partial_failed" : "failed";
}

export function toDemoChatErrorMetadata(
  event: Extract<ChatWorkflowStreamWireEvent, { type: "workflow:error" }>,
  deltaText: string,
): DemoChatErrorMetadata {
  const status = mapWorkflowErrorStatus(event, deltaText);
  const reason =
    typeof event.error.details?.reason === "string" ? event.error.details.reason : undefined;

  return {
    status,
    code: event.error.code,
    message: formatWorkflowError(event),
    ...(reason !== undefined ? { reason } : {}),
  };
}

export function formatWorkflowError(
  event: Extract<ChatWorkflowStreamWireEvent, { type: "workflow:error" }>,
): string {
  if (event.error.code === "output_safety_rejected") {
    return "输出未通过安全审计，本轮未成功完成";
  }
  if (
    event.error.code === "workflow_failed" &&
    event.error.details?.reason === "persistence_failed"
  ) {
    return "模型回复已生成，但会话持久化失败；刷新后可能丢失";
  }

  return event.error.message;
}

export function formatTurnStatus(status: DemoTurnStatus): string {
  const labels: Record<DemoTurnStatus, string> = {
    idle: "空闲",
    submitted: "请求已提交",
    planning_tool: "正在判断是否需要工具",
    searching: "正在搜索 Web",
    streaming: "正在生成回复",
    success: "本轮完成",
    degraded: "本轮完成，但部分后置步骤降级",
    partial_failed: "本轮未成功完成，已保留部分输出",
    output_safety_rejected: "输出未通过安全审计，本轮未成功完成",
    persistence_failed: "模型回复已生成，但会话持久化失败；刷新后可能丢失",
    tool_failed: "工具调用失败",
    cancelled: "本轮已取消",
    failed: "发送失败",
  };

  return labels[status];
}
