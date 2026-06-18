"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  ChatMessage,
  ChatWorkflowDebugContext,
  ChatWorkflowOutput,
  ConversationSummary,
  EmotionState,
  RecalledMemory,
  SummaryOptions,
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
  const [emotion, setEmotion] = useState<EmotionState | null>(null);
  const [summaryEnabled, setSummaryEnabled] = useState(false);
  const [recentMessageLimit, setRecentMessageLimit] = useState(10);
  const [summarizeTriggerMessageCount, setSummarizeTriggerMessageCount] = useState(14);
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
          ...(emotion !== null ? { emotion } : {}),
          sessionId,
          // patch-0 §9.2：显式传 scope（含 companionId），不依赖 resolveMemoryScope。
          scope: {
            ownerType: "session",
            ownerId: sessionId,
            companionId,
          },
          summaryOptions,
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
      setEmotion(output.emotion !== undefined ? toPersistedEmotion(output.emotion) : null);
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
    setEmotion(null);
    setResult(null);
    setEvents([]);
    setError(null);
  }

  const debugContext = result?.metadata?.debugContext as ChatWorkflowDebugContext | undefined;
  const summaryOptions: Required<SummaryOptions> = {
    enabled: summaryEnabled,
    recentMessageLimit,
    summarizeTriggerMessageCount,
  };

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
        {companionId || "(空)"} / emotion={formatEmotionInline(emotion)}
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

      <div className="summary-controls">
        <label className="summary-toggle">
          <input
            type="checkbox"
            checked={summaryEnabled}
            disabled={isLoading}
            onChange={(event) => setSummaryEnabled(event.target.checked)}
          />
          <span>启用滚动摘要（InMemorySummaryProvider）</span>
        </label>
        <label className="scope-field">
          <span>recentMessageLimit</span>
          <input
            className="scope-input"
            type="number"
            min={1}
            value={recentMessageLimit}
            disabled={isLoading}
            onChange={(event) => setRecentMessageLimit(toPositiveInteger(event.target.value, 10))}
          />
        </label>
        <label className="scope-field">
          <span>summarizeTriggerMessageCount</span>
          <input
            className="scope-input"
            type="number"
            min={1}
            value={summarizeTriggerMessageCount}
            disabled={isLoading}
            onChange={(event) =>
              setSummarizeTriggerMessageCount(toPositiveInteger(event.target.value, 14))
            }
          />
        </label>
      </div>

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

      {result !== null || emotion !== null ? (
        <EmotionPanel result={result} currentEmotion={emotion} events={events} />
      ) : null}

      {result !== null ? <ToolsPanel result={result} events={events} /> : null}

      {result !== null ? <PromptDebugPanel result={result} debugContext={debugContext} /> : null}

      {result !== null ? (
        <div className="result-grid">
          <DebugBlock title="Final Output" value={result.text} />
          <DebugBlock title="Recalled Memories" value={result.memories} />
          <DebugBlock title="Extracted Memories" value={result.metadata?.extractedMemories} />
          <DebugBlock title="Saved Memories" value={result.metadata?.savedMemories} />
          <DebugBlock title="Skipped Memories" value={result.metadata?.skippedMemories} />
          <DebugBlock title="Summary Metadata" value={pickSummaryMetadata(result)} />
          <DebugBlock title="Emotion Result" value={pickEmotionMetadata(result)} />
          <DebugBlock title="Tool Result" value={pickToolMetadata(result)} />
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

function EmotionPanel({
  result,
  currentEmotion,
  events,
}: {
  result: ChatWorkflowOutput | null;
  currentEmotion: EmotionState | null;
  events: SerializedCoreEvent[];
}) {
  const debugContext = result?.metadata?.debugContext as ChatWorkflowDebugContext | undefined;
  const emotionEvents = events.filter((event) => event.type.startsWith("emotion:"));

  return (
    <div className="debug-block">
      <p className="section-title">Emotion State Panel</p>
      <div className="memory-rows">
        <Row label="Emotion Before" value={formatEmotionInline(debugContext?.previousEmotion)} />
        <Row
          label="Intention Emotion Detected"
          value={formatEmotionInline(debugContext?.detectedEmotion)}
        />
        <Row
          label="Emotion After"
          value={formatEmotionInline(debugContext?.nextEmotion ?? currentEmotion)}
        />
      </div>
      <p className="section-subtitle">Emotion Prompt Block</p>
      <pre className="output">
        {debugContext?.emotionContext ?? "（neutral + 0，本轮未向 system prompt 注入情绪块）"}
      </pre>
      <p className="section-subtitle">Emotion Observer Events</p>
      <pre className="output">
        {emotionEvents.length === 0 ? "（无 emotion 事件）" : formatEvents(emotionEvents)}
      </pre>
    </div>
  );
}

function ToolsPanel({
  result,
  events,
}: {
  result: ChatWorkflowOutput;
  events: SerializedCoreEvent[];
}) {
  const debugContext = result.metadata?.debugContext as ChatWorkflowDebugContext | undefined;
  const toolEvents = events.filter((event) => event.type.startsWith("tool:"));

  return (
    <div className="debug-block">
      <p className="section-title">Tools Panel</p>
      <div className="memory-rows">
        <Row label="Provider" value={formatProviderName(result.metadata?.toolProvider)} />
        <Row label="Registered Tools" value={String(debugContext?.toolDefinitions?.length ?? 0)} />
        <Row label="Requested Tool Calls" value={String(debugContext?.toolCalls?.length ?? 0)} />
        <Row label="Tool Results" value={String(result.toolResults?.length ?? 0)} />
        <Row
          label="Dropped Tool Calls"
          value={String(debugContext?.droppedToolCalls?.length ?? 0)}
        />
        <Row
          label="Follow-up Generate"
          value={result.metadata?.toolFollowUpGenerated === true ? "yes" : "no"}
        />
      </div>
      <p className="section-subtitle">Registered Tools</p>
      <pre className="output">{render(debugContext?.toolDefinitions ?? [])}</pre>
      <p className="section-subtitle">Tool Calls</p>
      <pre className="output">{render(debugContext?.toolCalls ?? [])}</pre>
      <p className="section-subtitle">Tool Results</p>
      <pre className="output">{render(result.toolResults ?? [])}</pre>
      <p className="section-subtitle">Dropped Tool Calls（达到 V1 单轮工具限制后不再执行）</p>
      <pre className="output">{render(debugContext?.droppedToolCalls ?? [])}</pre>
      <p className="section-subtitle">Tool Follow-up Messages</p>
      <pre className="output">{render(debugContext?.toolFollowUpMessages ?? [])}</pre>
      <p className="section-subtitle">Tool Observer Events</p>
      <pre className="output">
        {toolEvents.length === 0 ? "（无 tool 事件）" : formatEvents(toolEvents)}
      </pre>
    </div>
  );
}

function PromptDebugPanel({
  result,
  debugContext,
}: {
  result: ChatWorkflowOutput;
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
  const recentHistory = debugContext.recentHistory ?? [];
  const summarizedMessages = debugContext.summarizedMessages ?? [];
  const currentUser = [...messages].reverse().find((message) => message.role === "user");
  const loadedSummary = result.metadata?.summary as ConversationSummary | null | undefined;
  const updatedSummary = result.metadata?.updatedSummary as ConversationSummary | null | undefined;

  return (
    <div className="debug-block">
      <p className="section-title">Prompt / Context Debug Panel</p>
      <p className="section-subtitle">scope</p>
      <pre className="output">{JSON.stringify(debugContext.scope, null, 2)}</pre>
      <p className="section-subtitle">Conversation Summary（生成前加载）</p>
      <pre className="output">{formatSummary(loadedSummary)}</pre>
      <p className="section-subtitle">Updated Summary（本轮生成后）</p>
      <pre className="output">
        {updatedSummary !== null && updatedSummary !== undefined
          ? formatSummary(updatedSummary)
          : `未更新：${String(result.metadata?.summarySkipReason ?? "unknown")}`}
      </pre>
      {debugContext.summaryContext !== undefined ? (
        <>
          <p className="section-subtitle">Conversation Summary Block（summaryContext）</p>
          <pre className="output">{debugContext.summaryContext}</pre>
        </>
      ) : null}
      <p className="section-subtitle">System Prompt（含 Persona + Summary + 长期记忆 + 情绪块）</p>
      <pre className="output">{debugContext.systemPrompt}</pre>
      <p className="section-subtitle">Long-term Memory Block（memoryContext）</p>
      <pre className="output">
        {debugContext.memoryContext ?? "（无召回，systemPrompt 不含记忆块）"}
      </pre>
      <p className="section-subtitle">Emotion Block（emotionContext）</p>
      <pre className="output">
        {debugContext.emotionContext ?? "（neutral + 0，systemPrompt 不含情绪块）"}
      </pre>
      <p className="section-subtitle">Recent History（debugContext.recentHistory）</p>
      <pre className="output">
        {recentHistory.length === 0 ? "（空）" : JSON.stringify(recentHistory, null, 2)}
      </pre>
      <p className="section-subtitle">Summarized Messages（本轮进入 update 的旧消息）</p>
      <pre className="output">
        {summarizedMessages.length === 0
          ? "（未触发摘要更新）"
          : JSON.stringify(summarizedMessages, null, 2)}
      </pre>
      <p className="section-subtitle">Current User Message</p>
      <pre className="output">{currentUser?.content ?? "—"}</pre>
      <p className="section-subtitle">Initial Generate Messages（首次传给模型）</p>
      <pre className="output">{JSON.stringify(messages, null, 2)}</pre>
      {debugContext.toolFollowUpMessages !== undefined ? (
        <>
          <p className="section-subtitle">Final Generate Messages（工具二次生成实际输入）</p>
          <pre className="output">{JSON.stringify(debugContext.toolFollowUpMessages, null, 2)}</pre>
        </>
      ) : null}
    </div>
  );
}

function ObserverEventsPanel({ events }: { events: SerializedCoreEvent[] }) {
  const memoryEvents = events.filter((event) => event.type.startsWith("memory:"));
  const summaryEvents = events.filter((event) => event.type.startsWith("summary:"));
  const emotionEvents = events.filter((event) => event.type.startsWith("emotion:"));
  const toolEvents = events.filter((event) => event.type.startsWith("tool:"));

  return (
    <div className="debug-block">
      <p className="section-title">Observer Events</p>
      <p className="section-subtitle">Summary Events（load / update / save）</p>
      <pre className="output">
        {summaryEvents.length === 0 ? "（无 summary 事件）" : formatEvents(summaryEvents)}
      </pre>
      <p className="section-subtitle">Memory Events（recall / extract / save）</p>
      <pre className="output">
        {memoryEvents.length === 0 ? "（无 memory 事件）" : formatEvents(memoryEvents)}
      </pre>
      <p className="section-subtitle">Emotion Events（analyze / transition）</p>
      <pre className="output">
        {emotionEvents.length === 0 ? "（无 emotion 事件）" : formatEvents(emotionEvents)}
      </pre>
      <p className="section-subtitle">Tool Events（list / execute）</p>
      <pre className="output">
        {toolEvents.length === 0 ? "（无 tool 事件）" : formatEvents(toolEvents)}
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
      return "error（Unavailable 严格回退，observer 可见 DB 错误）";
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

function toPositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatSummary(summary: ConversationSummary | null | undefined): string {
  if (summary === null || summary === undefined || summary.content.trim() === "") {
    return "No summary yet";
  }

  return JSON.stringify(
    {
      content: summary.content,
      updatedAt: summary.updatedAt,
      messageCount: summary.messageCount,
      messageRange: summary.messageRange,
      metadata: summary.metadata,
    },
    null,
    2,
  );
}

function pickSummaryMetadata(result: ChatWorkflowOutput): unknown {
  return {
    summaryProvider: result.metadata?.summaryProvider,
    summaryUpdater: result.metadata?.summaryUpdater,
    summarySkipped: result.metadata?.summarySkipped,
    summarySkipReason: result.metadata?.summarySkipReason,
    summary: result.metadata?.summary,
    updatedSummary: result.metadata?.updatedSummary,
  };
}

function pickEmotionMetadata(result: ChatWorkflowOutput): unknown {
  const debugContext = result.metadata?.debugContext as ChatWorkflowDebugContext | undefined;

  return {
    emotion: result.emotion,
    previousEmotion: debugContext?.previousEmotion,
    detectedEmotion: debugContext?.detectedEmotion,
    nextEmotion: debugContext?.nextEmotion,
    emotionContext: debugContext?.emotionContext,
  };
}

function pickToolMetadata(result: ChatWorkflowOutput): unknown {
  const debugContext = result.metadata?.debugContext as ChatWorkflowDebugContext | undefined;

  return {
    toolProvider: result.metadata?.toolProvider,
    toolDefinitions: debugContext?.toolDefinitions,
    toolCalls: debugContext?.toolCalls,
    toolResults: result.toolResults,
    droppedToolCalls: debugContext?.droppedToolCalls,
    toolCallsDropped: result.metadata?.toolCallsDropped,
    toolRounds: result.metadata?.toolRounds,
    toolFollowUpGenerated: result.metadata?.toolFollowUpGenerated,
  };
}

function formatProviderName(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return "—";
  }

  const provider = value as { id?: unknown; name?: unknown };
  const id = typeof provider.id === "string" ? provider.id : "unknown";
  const name = typeof provider.name === "string" ? provider.name : "unknown";

  return `${name} (${id})`;
}

function formatEmotionInline(emotion: EmotionState | null | undefined): string {
  if (emotion === null || emotion === undefined) {
    return "—";
  }

  return `${emotion.current} / ${Number(emotion.intensity.toFixed(2))}`;
}

function toPersistedEmotion(emotion: EmotionState): EmotionState {
  return {
    current: emotion.current,
    intensity: emotion.intensity,
    ...(emotion.updatedAt !== undefined ? { updatedAt: emotion.updatedAt } : {}),
  };
}

function formatEvents(events: SerializedCoreEvent[]): string {
  return events
    .map((event) => {
      const payload = event.payload as
        | { ok?: boolean; message?: string; error?: string }
        | undefined;
      const status =
        payload?.ok === false
          ? `error: ${payload.error ?? payload.message ?? "unknown"}`
          : payload?.ok === true
            ? "ok"
            : "";

      return `[${event.timestamp}] ${event.type} ${status}\n${JSON.stringify(
        event.payload,
        null,
        2,
      )}`;
    })
    .join("\n\n");
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
