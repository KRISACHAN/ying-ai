"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  ChatMessage,
  ChatWorkflowDebugContext,
  ChatWorkflowOutput,
  RecalledMemory,
} from "@ying-companion/ai-core";

const DEFAULT_SESSION_ID = "demo-chat-session";
const DEFAULT_COMPANION_ID = "debug-companion";

interface SerializedCoreEvent {
  type: string;
  timestamp: string;
  payload?: unknown;
}

interface ChatResponseBody {
  ok: boolean;
  output?: ChatWorkflowOutput;
  observerEvents?: SerializedCoreEvent[];
  memoryStatus?: MemoryDatabaseStatus;
  memoryReason?: string;
  error?: { message: string };
}

type MemoryDatabaseStatus = "disabled" | "connected" | "error";

interface MemoryDatabaseHealth {
  ok: boolean;
  databaseConnected: boolean;
  pgvectorEnabled: boolean;
  tableReady: boolean;
  error?: string;
}

interface MemoryHealthResponse {
  ok: boolean;
  status: MemoryDatabaseStatus;
  provider: {
    id: string;
    kind: string;
    name: string;
    description?: string;
    version?: string;
  };
  embeddingModel?: string;
  tableName?: string;
  reason?: string;
  health?: MemoryDatabaseHealth;
  error?: { message: string };
}

export function ChatPanel() {
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(DEFAULT_SESSION_ID);
  const [companionId, setCompanionId] = useState(DEFAULT_COMPANION_ID);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [result, setResult] = useState<ChatWorkflowOutput | null>(null);
  const [events, setEvents] = useState<SerializedCoreEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [health, setHealth] = useState<MemoryHealthResponse | null>(null);

  const refreshHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/memory-health");
      const body = (await response.json()) as MemoryHealthResponse;
      setHealth(body);
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

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
        body: JSON.stringify({
          message,
          history,
          sessionId,
          // patch-0 §9.2：显式传 scope（含 companionId），不依赖 resolveMemoryScope。
          scope: {
            ownerType: "session",
            ownerId: sessionId,
            companionId,
          },
        }),
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
      // 每轮聊天后刷新 health，保持 chat 与面板状态一致。
      void refreshHealth();
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

  function resetConversation() {
    setHistory([]);
    setResult(null);
    setEvents([]);
    setError(null);
  }

  const debugContext = result?.metadata?.debugContext as ChatWorkflowDebugContext | undefined;

  return (
    <section className="panel">
      <div className="heading">
        <span>Simple Chat Workflow Demo</span>
        <h1>聊天主链路调试（长期记忆 + PostgreSQL）</h1>
      </div>

      <p className="hint">
        通过 <code>core.executeWorkflow()</code> 走 Persona → Safety → Memory → Model → Safety →
        Memory 闭环。长期记忆 provider 由 <code>DATABASE_URL</code> 与 health 检查决定（见下方
        Memory DB Panel）。
      </p>

      <div className="scope-grid">
        <label className="scope-field">
          <span>sessionId（ownerId）</span>
          <input
            className="scope-input"
            value={sessionId}
            disabled={isLoading}
            onChange={(event) => setSessionId(event.target.value)}
          />
        </label>
        <label className="scope-field">
          <span>companionId</span>
          <input
            className="scope-input"
            value={companionId}
            disabled={isLoading}
            onChange={(event) => setCompanionId(event.target.value)}
          />
        </label>
      </div>
      <p className="meta-line">
        当前 scope：ownerType=session / ownerId={sessionId || "(空)"} / companionId=
        {companionId || "(空)"}
      </p>
      <p className="hint">
        切换 sessionId 或 companionId 可验证记忆隔离（§14.5）。切换后建议
        <button
          className="link-button"
          type="button"
          disabled={isLoading}
          onClick={resetConversation}
        >
          清空当前会话历史
        </button>
        ，避免旧 history 干扰召回验证。
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

      <MemoryDbPanel health={health} result={result} onRefresh={() => void refreshHealth()} />

      {result !== null ? <PromptDebugPanel debugContext={debugContext} /> : null}

      {result !== null ? (
        <div className="result-grid">
          <DebugBlock title="Final Output" value={result.text} />
          <DebugBlock title="Recalled Memories" value={result.memories} />
          <DebugBlock title="Extracted Memories" value={result.metadata?.extractedMemories} />
          <DebugBlock title="Saved Memories" value={result.metadata?.savedMemories} />
          <DebugBlock title="Skipped Memories" value={result.metadata?.skippedMemories} />
          <DebugBlock title="Safety Result" value={result.safety} />
          <DebugBlock title="Persona Result" value={result.persona} />
          <DebugBlock title="Model Raw Output" value={result.modelOutput} />
        </div>
      ) : null}

      <ObserverEventsPanel events={events} />
    </section>
  );
}

function MemoryDbPanel({
  health,
  result,
  onRefresh,
}: {
  health: MemoryHealthResponse | null;
  result: ChatWorkflowOutput | null;
  onRefresh: () => void;
}) {
  const providerMeta = result?.metadata?.memoryProvider as
    | MemoryHealthResponse["provider"]
    | undefined;
  const provider = providerMeta ?? health?.provider;
  const debugContext = result?.metadata?.debugContext as ChatWorkflowDebugContext | undefined;
  const recalled = (result?.memories ?? []) as RecalledMemory[];

  return (
    <div className="debug-block memory-panel">
      <div className="memory-panel-head">
        <p className="section-title">Memory DB Panel</p>
        <button className="link-button" type="button" onClick={onRefresh}>
          刷新 health
        </button>
      </div>

      <div className="memory-rows">
        <Row label="Status" value={renderStatus(health?.status)} />
        <Row label="Reason" value={health?.reason ?? "—"} />
        <Row label="Provider id" value={provider?.id ?? "—"} />
        <Row label="Provider name" value={provider?.name ?? "—"} />
        <Row label="Provider version" value={provider?.version ?? "—"} />
        <Row label="Database connected" value={renderBool(health?.health?.databaseConnected)} />
        <Row label="pgvector" value={renderBool(health?.health?.pgvectorEnabled)} />
        <Row label="Table ready" value={renderBool(health?.health?.tableReady)} />
        <Row label="Table name" value={health?.tableName ?? "—"} />
        <Row label="Embedding model" value={health?.embeddingModel ?? "—"} />
        <Row
          label="Embedding vector length"
          value={
            debugContext?.embeddingVectorLength !== undefined
              ? String(debugContext.embeddingVectorLength)
              : "—"
          }
        />
        <Row label="Health error" value={health?.health?.error ?? "—"} />
      </div>

      <p className="section-subtitle">Recalled（含 score）</p>
      <pre className="output">
        {recalled.length === 0
          ? "（本轮无召回）"
          : JSON.stringify(
              recalled.map((memory) => ({
                type: memory.type,
                content: memory.content,
                importance: memory.importance,
                score: memory.score,
              })),
              null,
              2,
            )}
      </pre>
    </div>
  );
}

function PromptDebugPanel({
  debugContext,
}: {
  debugContext: ChatWorkflowDebugContext | undefined;
}) {
  if (debugContext === undefined) {
    return (
      <div className="debug-block">
        <p className="section-title">Prompt / Context Debug Panel</p>
        <pre className="output">（workflow 未返回 debugContext）</pre>
      </div>
    );
  }

  const messages = debugContext.messages ?? [];
  const recentHistory = messages.filter((message, index) => {
    if (message.role === "system") {
      return false;
    }
    // 排除最后一条 user（当前输入），其余视为 Recent History。
    const isLastUser = index === messages.length - 1 && message.role === "user";
    return !isLastUser;
  });
  const currentUser = [...messages].reverse().find((message) => message.role === "user");

  return (
    <div className="debug-block">
      <p className="section-title">Prompt / Context Debug Panel</p>
      <p className="section-subtitle">scope</p>
      <pre className="output">{JSON.stringify(debugContext.scope, null, 2)}</pre>
      <p className="section-subtitle">System Prompt（含 Persona + 长期记忆块）</p>
      <pre className="output">{debugContext.systemPrompt}</pre>
      <p className="section-subtitle">Long-term Memory Block（memoryContext）</p>
      <pre className="output">
        {debugContext.memoryContext ?? "（无召回，systemPrompt 不含记忆块）"}
      </pre>
      <p className="section-subtitle">Recent History</p>
      <pre className="output">
        {recentHistory.length === 0 ? "（空）" : JSON.stringify(recentHistory, null, 2)}
      </pre>
      <p className="section-subtitle">Current User Message</p>
      <pre className="output">{currentUser?.content ?? "—"}</pre>
    </div>
  );
}

function ObserverEventsPanel({ events }: { events: SerializedCoreEvent[] }) {
  const memoryEvents = events.filter((event) => event.type.startsWith("memory:"));

  return (
    <div className="debug-block">
      <p className="section-title">Observer Events</p>
      <p className="section-subtitle">Memory Events（recall / extract / save）</p>
      <pre className="output">
        {memoryEvents.length === 0
          ? "（无 memory 事件）"
          : memoryEvents
              .map((event) => {
                const payload = event.payload as { ok?: boolean; message?: string } | undefined;
                const status =
                  payload?.ok === false
                    ? `error: ${payload.message ?? "unknown"}`
                    : payload?.ok === true
                      ? "ok"
                      : "";
                return `[${event.timestamp}] ${event.type} ${status}\n${JSON.stringify(
                  event.payload,
                  null,
                  2,
                )}`;
              })
              .join("\n\n")}
      </pre>
      <p className="section-subtitle">All Events</p>
      <pre className="output">{JSON.stringify(events, null, 2)}</pre>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="memory-row">
      <span className="memory-row-label">{label}</span>
      <span className="memory-row-value">{value}</span>
    </div>
  );
}

function renderStatus(status: MemoryDatabaseStatus | undefined): string {
  switch (status) {
    case "connected":
      return "connected（PostgreSQL）";
    case "disabled":
      return "disabled（InMemory）";
    case "error":
      return "error（Noop 严格回退）";
    default:
      return "unknown";
  }
}

function renderBool(value: boolean | undefined): string {
  if (value === undefined) {
    return "unknown";
  }
  return value ? "yes" : "no";
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
