"use client";

import { useState } from "react";

import type { ChatMessage, ChatWorkflowOutput } from "@ying-companion/ai-core";

const SESSION_ID = "demo-chat-session";

interface SerializedCoreEvent {
  type: string;
  timestamp: string;
  payload?: unknown;
}

interface ChatResponseBody {
  ok: boolean;
  output?: ChatWorkflowOutput;
  observerEvents?: SerializedCoreEvent[];
  error?: { message: string };
}

export function ChatPanel() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [result, setResult] = useState<ChatWorkflowOutput | null>(null);
  const [events, setEvents] = useState<SerializedCoreEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function sendMessage() {
    const message = input.trim();

    if (message === "" || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, sessionId: SESSION_ID }),
      });

      const body = (await response.json()) as ChatResponseBody;

      setEvents(body.observerEvents ?? []);

      if (!body.ok || body.output === undefined) {
        setResult(null);
        setError(body.error?.message ?? "聊天调用失败");
        return;
      }

      const output = body.output;
      setResult(output);
      setHistory((previous) => [
        ...previous,
        { role: "user", content: message },
        { role: "assistant", content: output.text },
      ]);
      setInput("");
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "聊天调用失败");
    } finally {
      setIsLoading(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <section className="panel">
      <div className="heading">
        <span>Simple Chat Workflow Demo</span>
        <h1>聊天主链路调试</h1>
      </div>

      <p className="hint">
        通过 <code>core.executeWorkflow()</code> 走 Persona → Safety → Model → Safety
        最小闭环。history 仅由本页面维护并随请求传入，Core 不保存（刷新即丢失）。
      </p>

      <textarea
        className="chat-input"
        placeholder="输入消息，⌘/Ctrl + Enter 发送"
        value={input}
        disabled={isLoading}
        rows={3}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={onKeyDown}
      />

      <button className="button" type="button" disabled={isLoading} onClick={sendMessage}>
        {isLoading ? "发送中" : "发送"}
      </button>

      <p className="meta-line">History Count（已传入 Core 的短期历史）：{history.length}</p>

      {error !== null ? <pre className="output output-error">{error}</pre> : null}

      {result !== null ? (
        <div className="result-grid">
          <DebugBlock title="Final Output" value={result.text} />
          <DebugBlock title="Safety Result" value={result.safety} />
          <DebugBlock title="Persona Result" value={result.persona} />
          <DebugBlock title="Metadata" value={result.metadata} />
          <DebugBlock title="Model Raw Output" value={result.modelOutput} />
        </div>
      ) : null}

      <DebugBlock title="Observer Events" value={events} />
    </section>
  );
}

function DebugBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="debug-block">
      <p className="section-title">{title}</p>
      <pre className="output">{render(value)}</pre>
    </div>
  );
}

function render(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}
