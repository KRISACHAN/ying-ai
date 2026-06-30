"use client";

import type { ConversationSummary, EmotionState, WorkflowTrace } from "@ying-companion/ai-core";

import type { ChatWorkflowStreamWireEvent } from "./lib/chat-stream-wire";
import type { MemoryHealthView, WorkflowRunDetail, WorkflowRunListItem } from "./lib/debug-types";

interface RunDebugPanelProps {
  run: WorkflowRunDetail | null;
  runs: WorkflowRunListItem[];
  selectedRunId: string;
  onSelectRun: (runId: string) => void | Promise<void>;
  health: MemoryHealthView | null;
  summary: ConversationSummary | null;
  memoriesHref: string;
  streamEvents: ChatWorkflowStreamWireEvent[];
  turnStatus: string;
  workflowId: string | null;
}

export function RunDebugPanel({
  run,
  runs,
  selectedRunId,
  onSelectRun,
  health,
  summary,
  memoriesHref,
  streamEvents,
  turnStatus,
  workflowId,
}: RunDebugPanelProps) {
  const debugContext = run?.debugContext ?? null;

  if (run === null) {
    return (
      <aside className="debug-pane">
        <h2>调试工作台</h2>
        <RunSelector runs={runs} selectedRunId={selectedRunId} onSelectRun={onSelectRun} />
        <p className="hint">选择或发送一条 AI 回复后，这里会展示对应 workflow run。</p>
        <StreamTimeline events={streamEvents} turnStatus={turnStatus} workflowId={workflowId} />
        <MemoryHealthBlock health={health} />
      </aside>
    );
  }

  return (
    <aside className="debug-pane">
      <div className="pane-head">
        <div>
          <span>Workflow Run</span>
          <h2>{run.status}</h2>
        </div>
        <a className="link-button" href={memoriesHref}>
          管理长期记忆
        </a>
      </div>
      <RunSelector runs={runs} selectedRunId={selectedRunId} onSelectRun={onSelectRun} />

      <StreamTimeline events={streamEvents} turnStatus={turnStatus} workflowId={workflowId} />

      <section className="debug-section">
        <h3>运行总览</h3>
        <Rows
          rows={[
            ["Run ID", run.id],
            ["Workflow ID", run.workflowId ?? "-"],
            ["Status", run.status],
            ["Model", run.model ?? "-"],
            ["Created", formatDate(run.createdAt)],
            ["Error", run.errorSummary ?? "-"],
          ]}
        />
      </section>

      <MemoryHealthBlock health={health} />

      <section className="debug-section">
        <h3>持久化 Trace 时间线</h3>
        <TraceBlock trace={run.trace} />
      </section>

      <section className="debug-section">
        <h3>伴侣与上下文</h3>
        <Rows
          rows={[
            ["Scope", render(debugContext?.scope ?? "-")],
            ["Recent history", String(debugContext?.recentHistory?.length ?? 0)],
            ["Summary", summary?.content.trim() || "No summary yet"],
          ]}
        />
      </section>

      <section className="debug-section">
        <h3>Prompt Debug</h3>
        <DebugPre title="System Prompt" value={debugContext?.systemPrompt ?? "（无）"} />
        <DebugPre title="Memory Context" value={debugContext?.memoryContext ?? "（无）"} />
        <DebugPre title="Summary Context" value={debugContext?.summaryContext ?? "（无）"} />
        <DebugPre title="Emotion Context" value={debugContext?.emotionContext ?? "（无）"} />
        <DebugPre title="Initial Generate Messages" value={debugContext?.messages ?? []} />
        <DebugPre
          title="Partial Output Text"
          value={getPartialOutputText(debugContext) ?? "（无）"}
        />
      </section>

      <section className="debug-section">
        <h3>记忆</h3>
        <DebugPre title="Memory Snapshot（含本轮 recalled score）" value={run.memorySnapshot} />
      </section>

      <section className="debug-section">
        <h3>情绪</h3>
        <Rows
          rows={[
            ["Previous", formatEmotion(debugContext?.previousEmotion)],
            ["Detected", formatEmotion(debugContext?.detectedEmotion)],
            ["Next", formatEmotion(debugContext?.nextEmotion)],
          ]}
        />
        <DebugPre title="Emotion Snapshot" value={run.emotionSnapshot} />
      </section>

      <section className="debug-section">
        <h3>工具</h3>
        <DebugPre title="Tool Snapshot" value={run.toolSnapshot} />
      </section>

      <section className="debug-section">
        <h3>Observer</h3>
        <p className="hint">CoreObserver 是旁路观测，不驱动流式聊天状态。</p>
        <DebugPre title="Observer Events" value={run.observerEvents} />
      </section>
    </aside>
  );
}

function StreamTimeline({
  events,
  turnStatus,
  workflowId,
}: {
  events: ChatWorkflowStreamWireEvent[];
  turnStatus: string;
  workflowId: string | null;
}) {
  const deltaCount = events.filter((event) => event.type === "text:delta").length;
  const deltaText = events
    .filter((event): event is Extract<ChatWorkflowStreamWireEvent, { type: "text:delta" }> => {
      return event.type === "text:delta";
    })
    .map((event) => event.text)
    .join("");

  return (
    <section className="debug-section">
      <h3>Workflow Stream Timeline</h3>
      <Rows
        rows={[
          ["Turn status", turnStatus],
          ["Workflow ID", workflowId ?? "-"],
          ["Wire events", String(events.length)],
          ["Text delta count", String(deltaCount)],
        ]}
      />
      <pre className="output">
        {events.length === 0
          ? "（本轮还没有 Wire Event）"
          : events.map((event, index) => `${index + 1}. ${formatWireEvent(event)}`).join("\n")}
      </pre>
      {deltaText !== "" ? <DebugPre title="Aggregated text:delta" value={deltaText} /> : null}
    </section>
  );
}

function formatWireEvent(event: ChatWorkflowStreamWireEvent): string {
  switch (event.type) {
    case "workflow:start":
      return `${event.type} ${event.timestamp}`;
    case "step:start":
      return `${event.type} ${event.step} ${event.timestamp}`;
    case "step:end":
      return `${event.type} ${event.step} / ${event.status} ${formatSummary(event.summary)}`;
    case "text:delta":
      return `${event.type} ${JSON.stringify(event.text)}`;
    case "tool:call":
      return `${event.type} ${event.call.name}`;
    case "tool:result":
      return `${event.type} ${event.result.name} ok=${String(event.result.ok ?? true)}`;
    case "workflow:finish":
      return `${event.type} textLength=${event.output.text.length}`;
    case "workflow:error":
      return `${event.type} ${event.error.code} ${event.error.message}`;
  }
}

function formatSummary(summary: Record<string, unknown> | undefined): string {
  return summary === undefined ? "" : JSON.stringify(summary);
}

function RunSelector({
  runs,
  selectedRunId,
  onSelectRun,
}: {
  runs: WorkflowRunListItem[];
  selectedRunId: string;
  onSelectRun: (runId: string) => void | Promise<void>;
}) {
  return (
    <div className="run-selector">
      <label className="scope-field">
        <span>本轮 run</span>
        <select
          className="scope-input"
          value={selectedRunId}
          onChange={(event) => {
            if (event.target.value !== "") {
              void onSelectRun(event.target.value);
            }
          }}
        >
          <option value="">选择 run</option>
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {run.status} · {new Date(run.createdAt).toLocaleString("zh-CN", { hour12: false })}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function MemoryHealthBlock({ health }: { health: MemoryHealthView | null }) {
  return (
    <section className="debug-section">
      <h3>Memory DB Health</h3>
      <Rows
        rows={[
          ["Status", health?.status ?? "unknown"],
          ["Reason", health?.reason ?? "-"],
          ["Provider", health?.provider?.id ?? "-"],
          ["Table", health?.tableName ?? "-"],
          ["Embedding", health?.embeddingModel ?? "-"],
        ]}
      />
      <DebugPre title="Health Detail" value={health?.health ?? null} />
    </section>
  );
}

function TraceBlock({ trace }: { trace: WorkflowTrace | null }) {
  if (trace === null) {
    return <pre className="output">（无 trace）</pre>;
  }

  return (
    <>
      <Rows
        rows={[
          ["Workflow ID", trace.workflowId],
          ["Status", trace.status],
          ["Duration", `${trace.durationMs ?? 0} ms`],
          ["Budget", trace.budgetMs !== undefined ? `${trace.budgetMs} ms` : "not set"],
          ["Budget exceeded", trace.budgetExceeded === true ? "yes" : "no"],
        ]}
      />
      <pre className="output">
        {trace.steps
          .map((step, index) => {
            const duration = step.durationMs !== undefined ? `${step.durationMs}ms` : "-";
            const summary = step.summary !== undefined ? ` ${JSON.stringify(step.summary)}` : "";
            const error = step.error !== undefined ? ` error=${step.error.message}` : "";

            return `${index + 1}. ${step.step} / ${step.status} / ${duration}${summary}${error}`;
          })
          .join("\n")}
      </pre>
    </>
  );
}

function DebugPre({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="debug-details" open={typeof value === "string" && value.length < 800}>
      <summary>{title}</summary>
      <pre className="output">{render(value)}</pre>
    </details>
  );
}

function Rows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="memory-rows">
      {rows.map(([label, value]) => (
        <div className="memory-row" key={label}>
          <span className="memory-row-label">{label}</span>
          <span className="memory-row-value">{value}</span>
        </div>
      ))}
    </div>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatEmotion(emotion: EmotionState | null | undefined): string {
  if (emotion === null || emotion === undefined) {
    return "-";
  }

  return `${emotion.current} / ${Number(emotion.intensity.toFixed(2))}`;
}

function getPartialOutputText(debugContext: unknown): string | null {
  if (typeof debugContext !== "object" || debugContext === null || Array.isArray(debugContext)) {
    return null;
  }

  const value = (debugContext as Record<string, unknown>).partial_output_text;
  return typeof value === "string" && value !== "" ? value : null;
}

function render(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}
