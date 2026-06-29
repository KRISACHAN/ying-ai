"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { RunDebugPanel } from "./run-debug-panel";
import { ChatStreamProtocolError, parseNdjsonWireEvents } from "./lib/chat-stream-transport";
import type { ChatWorkflowStreamWireEvent } from "./lib/chat-stream-wire";
import type {
  ConversationDetail,
  DebugMessage,
  MemoryHealthView,
  WorkflowRunDetail,
  WorkflowRunListItem,
} from "./lib/debug-types";
import type { DebugModelConfig } from "./lib/model-config";

const MODEL_CONFIG_STORAGE_KEY = "demo:model-config:v1";

type ChatTurnStatus =
  | "idle"
  | "preparing"
  | "streaming"
  | "completed"
  | "degraded"
  | "partial-failed"
  | "safety-rejected"
  | "persistence-failed"
  | "failed";

export function ConversationWorkspace({
  initialDetail,
  initialRuns,
  initialRun,
  memoryHealth,
  defaultModelConfig,
}: {
  initialDetail: ConversationDetail;
  initialRuns: WorkflowRunListItem[];
  initialRun: WorkflowRunDetail | null;
  memoryHealth: MemoryHealthView | null;
  defaultModelConfig: DebugModelConfig;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialDetail.messages);
  const [runs, setRuns] = useState(initialRuns);
  const [selectedRun, setSelectedRun] = useState<WorkflowRunDetail | null>(initialRun);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnStatus, setTurnStatus] = useState<ChatTurnStatus>("idle");
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [streamEvents, setStreamEvents] = useState<ChatWorkflowStreamWireEvent[]>([]);
  const [modelConfig, setModelConfig] = useState<DebugModelConfig>(defaultModelConfig);
  const [apiKeyOverride, setApiKeyOverride] = useState("");
  const activeTurnId = useRef<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(MODEL_CONFIG_STORAGE_KEY);

      if (stored !== null) {
        setModelConfig(JSON.parse(stored) as DebugModelConfig);
      }
    } catch {
      setModelConfig(defaultModelConfig);
    }
  }, [defaultModelConfig]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(MODEL_CONFIG_STORAGE_KEY, JSON.stringify(modelConfig));
    } catch {
      // sessionStorage is a convenience cache; failed persistence must not block chat.
    }
  }, [modelConfig]);

  const runByAssistantMessage = useMemo(() => {
    const map = new Map<string, WorkflowRunListItem>();

    for (const run of runs) {
      if (run.assistantMessageId !== null) {
        map.set(run.assistantMessageId, run);
      }
    }

    return map;
  }, [runs]);

  async function sendMessage() {
    const message = input.trim();

    if (message === "" || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);
    setTurnStatus("preparing");
    setWorkflowId(null);
    setStreamEvents([]);
    setInput("");
    const localTurnId = `turn-${Date.now()}`;
    activeTurnId.current = localTurnId;
    const optimistic: DebugMessage = {
      id: `${localTurnId}-user`,
      conversationId: initialDetail.conversation.id,
      role: "user",
      content: message,
      status: "pending",
      errorSummary: null,
      model: null,
      createdAt: new Date().toISOString(),
    };
    const pendingAssistant: DebugMessage = {
      id: `${localTurnId}-assistant`,
      conversationId: initialDetail.conversation.id,
      role: "assistant",
      content: "",
      status: "pending",
      errorSummary: null,
      model: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((previous) => [...previous, optimistic, pendingAssistant]);

    try {
      const response = await fetch(`/api/conversations/${initialDetail.conversation.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify({
          message,
          modelConfig,
          ...(apiKeyOverride.trim() !== "" ? { apiKeyOverride } : {}),
        }),
      });

      if (!response.ok || response.body === null) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        const messageText = body?.error?.message ?? "发送失败";
        failPendingMessages(localTurnId, messageText);
        return;
      }

      let deltaText = "";

      for await (const event of parseNdjsonWireEvents(response.body)) {
        if (activeTurnId.current !== localTurnId) {
          return;
        }

        setStreamEvents((previous) => [...previous, event]);
        setWorkflowId(event.workflowId);

        if (event.type === "text:delta") {
          deltaText += event.text;
          setTurnStatus("streaming");
          setMessages((previous) =>
            previous.map((item) =>
              item.id === pendingAssistant.id
                ? { ...item, content: item.content + event.text, model: event.model ?? item.model }
                : item,
            ),
          );
        }

        if (event.type === "workflow:finish") {
          if (deltaText !== event.output.text) {
            failPendingMessages(localTurnId, "协议错误：delta 聚合文本与最终输出不一致");
            return;
          }

          const nextStatus = hasDegradedTrace(event.output.trace) ? "degraded" : "completed";
          setTurnStatus(nextStatus);
          await refreshConversationState();
          return;
        }

        if (event.type === "workflow:error") {
          const nextStatus = mapWorkflowErrorStatus(event, deltaText);
          setTurnStatus(nextStatus);
          const messageText = formatWorkflowError(event);
          setError(messageText);
          setMessages((previous) =>
            previous.map((item) => {
              if (item.id === optimistic.id || item.id === pendingAssistant.id) {
                return { ...item, status: "failed", errorSummary: messageText };
              }

              return item;
            }),
          );
          await refreshRunsOnly();
          return;
        }
      }
    } catch (caught) {
      const messageText =
        caught instanceof ChatStreamProtocolError
          ? `protocol_error: ${caught.message}`
          : caught instanceof Error
            ? caught.message
            : "发送失败";
      failPendingMessages(localTurnId, messageText);
    } finally {
      setIsSending(false);
      activeTurnId.current = null;
    }
  }

  function failPendingMessages(localTurnId: string, messageText: string) {
    setError(messageText);
    setTurnStatus("failed");
    setMessages((previous) =>
      previous.map((item) =>
        item.id.startsWith(localTurnId)
          ? { ...item, status: "failed", errorSummary: messageText }
          : item,
      ),
    );
  }

  async function refreshConversationState() {
    const [detailResponse, runsResponse] = await Promise.all([
      fetch(`/api/conversations/${initialDetail.conversation.id}`),
      fetch(`/api/conversations/${initialDetail.conversation.id}/runs`),
    ]);
    const detailBody = (await detailResponse.json()) as { ok: boolean } & ConversationDetail;
    const runsBody = (await runsResponse.json()) as {
      ok: boolean;
      runs?: WorkflowRunListItem[];
    };

    if (!detailBody.ok || !runsBody.ok || runsBody.runs === undefined) {
      throw new Error("刷新持久化会话详情失败");
    }

    setMessages(detailBody.messages);
    setRuns(runsBody.runs);

    const latestRun = runsBody.runs[0];

    if (latestRun !== undefined) {
      await selectRun(latestRun.id);
    }

    router.refresh();
  }

  async function refreshRunsOnly() {
    const response = await fetch(`/api/conversations/${initialDetail.conversation.id}/runs`);
    const body = (await response.json()) as { ok: boolean; runs?: WorkflowRunListItem[] };

    if (body.ok && body.runs !== undefined) {
      setRuns(body.runs);
      const latestRun = body.runs[0];

      if (latestRun !== undefined) {
        await selectRun(latestRun.id);
      }
    }
  }

  async function selectRun(runId: string) {
    const response = await fetch(
      `/api/conversations/${initialDetail.conversation.id}/runs/${runId}`,
    );
    const body = (await response.json()) as {
      ok: boolean;
      run?: WorkflowRunDetail;
      error?: { message: string };
    };

    if (body.ok && body.run !== undefined) {
      setSelectedRun(body.run);
    } else {
      setError(body.error?.message ?? "加载 run 失败");
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <div className="conversation-grid">
      <RunDebugPanel
        run={selectedRun}
        runs={runs}
        selectedRunId={selectedRun?.id ?? ""}
        onSelectRun={selectRun}
        health={memoryHealth}
        summary={initialDetail.summary}
        memoriesHref={`/companions/${initialDetail.companion.id}/memories`}
        streamEvents={streamEvents}
        turnStatus={turnStatus}
        workflowId={workflowId}
      />

      <section className="chat-pane">
        <ModelConfigForm
          value={modelConfig}
          apiKeyOverride={apiKeyOverride}
          disabled={isSending}
          onChange={setModelConfig}
          onApiKeyOverrideChange={setApiKeyOverride}
        />

        <div className="message-list">
          {messages.map((message) => {
            const linkedRun = runByAssistantMessage.get(message.id);

            return (
              <button
                className={`message-bubble message-${message.role}`}
                type="button"
                key={message.id}
                disabled={linkedRun === undefined}
                onClick={() => {
                  if (linkedRun !== undefined) {
                    void selectRun(linkedRun.id);
                  }
                }}
              >
                <span>{message.role === "user" ? "User" : "Assistant"}</span>
                <p>{message.content}</p>
                <small>
                  {message.status}
                  {message.errorSummary !== null ? ` · ${message.errorSummary}` : ""}
                </small>
              </button>
            );
          })}
        </div>

        {error !== null ? <p className="form-error">{error}</p> : null}
        <p className="meta-line">
          {formatTurnStatus(turnStatus)}
          {workflowId !== null ? ` · workflowId=${workflowId}` : ""}
        </p>

        <div className="chat-composer">
          <textarea
            className="chat-input"
            value={input}
            rows={4}
            disabled={isSending}
            placeholder="输入消息，Enter 发送，Shift + Enter 换行"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button className="button" type="button" disabled={isSending} onClick={sendMessage}>
            {isSending ? "发送中" : "发送"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ModelConfigForm({
  value,
  apiKeyOverride,
  disabled,
  onChange,
  onApiKeyOverrideChange,
}: {
  value: DebugModelConfig;
  apiKeyOverride: string;
  disabled: boolean;
  onChange: (value: DebugModelConfig) => void;
  onApiKeyOverrideChange: (value: string) => void;
}) {
  return (
    <section className="model-config-panel">
      <div className="inline-fields">
        <label className="scope-field">
          <span>Provider</span>
          <select
            className="scope-input"
            value={value.provider}
            disabled={disabled}
            onChange={(event) => {
              onChange(
                event.target.value === "ollama"
                  ? { provider: "ollama", model: "llama3.1", host: "http://127.0.0.1:11434" }
                  : { provider: "openai-compatible", model: "" },
              );
            }}
          >
            <option value="openai-compatible">OpenAI-compatible</option>
            <option value="ollama">Ollama</option>
          </select>
        </label>
        <label className="scope-field">
          <span>Model</span>
          <input
            className="scope-input"
            value={value.model}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, model: event.target.value })}
          />
        </label>
      </div>

      {value.provider === "openai-compatible" ? (
        <div className="inline-fields">
          <label className="scope-field">
            <span>Base URL</span>
            <input
              className="scope-input"
              value={value.baseUrl ?? ""}
              disabled={disabled}
              onChange={(event) =>
                onChange(updateOptionalString(value, "baseUrl", event.target.value))
              }
            />
          </label>
          <label className="scope-field">
            <span>API key override</span>
            <input
              className="scope-input"
              type="password"
              value={apiKeyOverride}
              disabled={disabled}
              autoComplete="off"
              onChange={(event) => onApiKeyOverrideChange(event.target.value)}
            />
          </label>
        </div>
      ) : (
        <div className="inline-fields">
          <label className="scope-field">
            <span>Host</span>
            <input
              className="scope-input"
              value={value.host ?? ""}
              disabled={disabled}
              onChange={(event) =>
                onChange(updateOptionalString(value, "host", event.target.value))
              }
            />
          </label>
          <label className="scope-field">
            <span>Keep alive</span>
            <input
              className="scope-input"
              value={value.keepAlive ?? ""}
              disabled={disabled}
              onChange={(event) =>
                onChange(updateOptionalString(value, "keepAlive", event.target.value))
              }
            />
          </label>
        </div>
      )}
    </section>
  );
}

function mapWorkflowErrorStatus(
  event: Extract<ChatWorkflowStreamWireEvent, { type: "workflow:error" }>,
  deltaText: string,
): ChatTurnStatus {
  if (event.error.code === "output_safety_rejected") {
    return "safety-rejected";
  }
  if (
    event.error.code === "workflow_failed" &&
    event.error.details?.reason === "persistence_failed"
  ) {
    return "persistence-failed";
  }

  return deltaText.length > 0 ? "partial-failed" : "failed";
}

function updateOptionalString<T extends DebugModelConfig, K extends keyof T>(
  config: T,
  key: K,
  value: string,
): T {
  const normalized = value.trim();
  const next = { ...config };

  if (normalized === "") {
    delete next[key];
  } else {
    next[key] = normalized as T[K];
  }

  return next;
}

function formatWorkflowError(
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

function formatTurnStatus(status: ChatTurnStatus): string {
  const labels: Record<ChatTurnStatus, string> = {
    idle: "空闲",
    preparing: "准备工作流中",
    streaming: "正在生成回复",
    completed: "本轮完成",
    degraded: "本轮完成，但部分后置步骤降级",
    "partial-failed": "本轮未成功完成，已保留部分输出",
    "safety-rejected": "输出未通过安全审计，本轮未成功完成",
    "persistence-failed": "模型回复已生成，但会话持久化失败；刷新后可能丢失",
    failed: "发送失败",
  };

  return labels[status];
}

function hasDegradedTrace(trace: unknown): boolean {
  if (typeof trace !== "object" || trace === null) {
    return false;
  }

  const maybeTrace = trace as { status?: unknown; steps?: Array<{ status?: unknown }> };
  return (
    maybeTrace.status === "degraded" ||
    maybeTrace.steps?.some((step) => step.status === "degraded") === true
  );
}
