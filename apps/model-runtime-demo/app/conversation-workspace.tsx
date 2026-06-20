"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { RunDebugPanel } from "./run-debug-panel";
import type {
  ConversationDetail,
  DebugMessage,
  MemoryHealthView,
  WorkflowRunDetail,
  WorkflowRunListItem,
} from "./lib/debug-types";

interface SendResponse {
  ok: boolean;
  userMessage?: DebugMessage;
  assistantMessage?: DebugMessage;
  conversation?: ConversationDetail["conversation"];
  workflowRun?: WorkflowRunDetail;
  error?: { message: string };
}

export function ConversationWorkspace({
  initialDetail,
  initialRuns,
  initialRun,
  memoryHealth,
}: {
  initialDetail: ConversationDetail;
  initialRuns: WorkflowRunListItem[];
  initialRun: WorkflowRunDetail | null;
  memoryHealth: MemoryHealthView | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialDetail.messages);
  const [runs, setRuns] = useState(initialRuns);
  const [selectedRun, setSelectedRun] = useState<WorkflowRunDetail | null>(initialRun);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setInput("");
    const optimistic: DebugMessage = {
      id: `pending-${Date.now()}`,
      conversationId: initialDetail.conversation.id,
      role: "user",
      content: message,
      status: "pending",
      errorSummary: null,
      model: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((previous) => [...previous, optimistic]);

    try {
      const response = await fetch(`/api/conversations/${initialDetail.conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = (await response.json()) as SendResponse;

      if (!body.ok || body.userMessage === undefined || body.workflowRun === undefined) {
        setError(body.error?.message ?? "发送失败");
        setMessages((previous) =>
          previous.map((item) =>
            item.id === optimistic.id
              ? { ...item, status: "failed", errorSummary: body.error?.message ?? "发送失败" }
              : item,
          ),
        );
        return;
      }

      setMessages((previous) => {
        const withoutOptimistic = previous.filter((item) => item.id !== optimistic.id);
        const next = [...withoutOptimistic, body.userMessage as DebugMessage];

        if (body.assistantMessage !== undefined) {
          next.push(body.assistantMessage);
        }

        return next;
      });
      const workflowRun = body.workflowRun;
      setRuns((previous) => [
        {
          id: workflowRun.id,
          userMessageId: workflowRun.userMessageId,
          assistantMessageId: workflowRun.assistantMessageId,
          status: workflowRun.status,
          workflowId: workflowRun.workflowId,
          model: workflowRun.model,
          errorSummary: workflowRun.errorSummary,
          createdAt: workflowRun.createdAt,
        },
        ...previous.filter((item) => item.id !== workflowRun.id),
      ]);
      setSelectedRun(workflowRun);
      router.refresh();
    } catch (caught) {
      const messageText = caught instanceof Error ? caught.message : "发送失败";
      setError(messageText);
      setMessages((previous) =>
        previous.map((item) =>
          item.id === optimistic.id
            ? { ...item, status: "failed", errorSummary: messageText }
            : item,
        ),
      );
    } finally {
      setIsSending(false);
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
        health={memoryHealth}
        summary={initialDetail.summary}
        memoriesHref={`/companions/${initialDetail.companion.id}/memories`}
      />

      <section className="chat-pane">
        <div className="run-selector">
          <label className="scope-field">
            <span>本轮 run</span>
            <select
              className="scope-input"
              value={selectedRun?.id ?? ""}
              onChange={(event) => void selectRun(event.target.value)}
            >
              <option value="">选择 run</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.status} ·{" "}
                  {new Date(run.createdAt).toLocaleString("zh-CN", { hour12: false })}
                </option>
              ))}
            </select>
          </label>
        </div>

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
