"use client";

import { useChat } from "@ai-sdk/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConversationComposer } from "./components/conversation-composer";
import { ConversationMessage } from "./components/conversation-message";
import { RunDebugPanel } from "./run-debug-panel";
import type { DemoTurnStatus } from "./lib/chat-turn-state";
import { DemoChatTransport } from "./lib/demo-chat-transport";
import { mapPersistedMessagesToUI, type DemoUIMessage } from "./lib/demo-ui-message";
import type { ChatWorkflowStreamWireEvent } from "./lib/chat-stream-wire";
import type {
  ConversationDetail,
  MemoryHealthView,
  WorkflowRunDetail,
  WorkflowRunListItem,
} from "./lib/debug-types";
import {
  validateDebugModelConfig,
  mergeStoredModelConfigWithDefaults,
  type DebugModelConfig,
} from "./lib/model-config";
import {
  formatWebSearchAvailabilityLabel,
  type WebSearchAvailability,
} from "./lib/web-search-availability";

const MODEL_CONFIG_STORAGE_KEY = "demo:model-config:v1";
const USER_SCROLL_RESUME_DELAY_MS = 2000;

export function ConversationWorkspace({
  initialDetail,
  initialRuns,
  initialRun,
  memoryHealth,
  defaultModelConfig,
  initialWebSearchAvailability,
}: {
  initialDetail: ConversationDetail;
  initialRuns: WorkflowRunListItem[];
  initialRun: WorkflowRunDetail | null;
  memoryHealth: MemoryHealthView | null;
  defaultModelConfig: DebugModelConfig;
  initialWebSearchAvailability: WebSearchAvailability;
}) {
  const router = useRouter();
  const [runs, setRuns] = useState(initialRuns);
  const [selectedRun, setSelectedRun] = useState<WorkflowRunDetail | null>(initialRun);
  const [input, setInput] = useState("");
  const [streamEvents, setStreamEvents] = useState<ChatWorkflowStreamWireEvent[]>([]);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [modelConfig, setModelConfig] = useState<DebugModelConfig>(defaultModelConfig);
  const [apiKeyOverride, setApiKeyOverride] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(initialWebSearchAvailability.available);
  const [debugDrawerOpen, setDebugDrawerOpen] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const previousAvailabilityRef = useRef<boolean>(initialWebSearchAvailability.available);
  const modelConfigRef = useRef(modelConfig);
  const apiKeyOverrideRef = useRef(apiKeyOverride);
  const webSearchEnabledRef = useRef(webSearchEnabled);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const userScrollPausedRef = useRef(false);
  const resumeScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollingRef = useRef(false);

  const displayedWebSearchAvailability = useMemo((): WebSearchAvailability => {
    const caps = {
      ...defaultModelConfig.capabilities,
      ...modelConfig.capabilities,
    };

    if (caps.toolCalling !== true) {
      return { available: false, reason: "tool_calling_unsupported" };
    }

    return initialWebSearchAvailability;
  }, [defaultModelConfig.capabilities, initialWebSearchAvailability, modelConfig.capabilities]);

  const runByAssistantMessage = useMemo(() => buildRunMap(runs), [runs]);
  const initialMessages = useMemo(
    () => mapPersistedMessagesToUI(initialDetail.messages, buildRunMap(initialRuns)),
    [initialDetail.messages, initialRuns],
  );

  const transport = useMemo(
    () =>
      new DemoChatTransport({
        conversationId: initialDetail.conversation.id,
        getModelConfig: () => modelConfigRef.current,
        getApiKeyOverride: () => apiKeyOverrideRef.current,
        getWebSearchEnabled: () =>
          displayedWebSearchAvailability.available && webSearchEnabledRef.current,
        onWireEvent: (event) => {
          setStreamEvents((previous) => [...previous, event]);
          setWorkflowId(event.workflowId);
        },
        onWorkflowTerminal: async () => {
          await refreshConversationState();
        },
        onWorkflowTerminalError: (error) => {
          setRefreshWarning(error instanceof Error ? error.message : "刷新持久化会话详情失败");
        },
      }),
    [displayedWebSearchAvailability.available, initialDetail.conversation.id],
  );

  const { messages, setMessages, sendMessage, status, error } = useChat<DemoUIMessage>({
    id: initialDetail.conversation.id,
    messages: initialMessages,
    transport,
  });
  const statusRef = useRef(status);

  const turnStatus = useMemo((): DemoTurnStatus => {
    const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    return latestAssistant?.metadata?.turnStatus ?? (status === "submitted" ? "submitted" : "idle");
  }, [messages, status]);

  useEffect(() => {
    modelConfigRef.current = modelConfig;
  }, [modelConfig]);

  useEffect(() => {
    apiKeyOverrideRef.current = apiKeyOverride;
  }, [apiKeyOverride]);

  useEffect(() => {
    webSearchEnabledRef.current = webSearchEnabled;
  }, [webSearchEnabled]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    return () => {
      if (resumeScrollTimerRef.current !== null) {
        clearTimeout(resumeScrollTimerRef.current);
      }
      if (autoScrollTimerRef.current !== null) {
        clearTimeout(autoScrollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (status !== "streaming" || userScrollPausedRef.current) {
      return;
    }

    scrollMessagesToBottom(messageListRef.current);
  }, [messages, status]);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(MODEL_CONFIG_STORAGE_KEY);

      if (stored !== null) {
        setModelConfig(
          mergeStoredModelConfigWithDefaults(
            validateDebugModelConfig(JSON.parse(stored)),
            defaultModelConfig,
          ),
        );
      }
    } catch {
      window.sessionStorage.removeItem(MODEL_CONFIG_STORAGE_KEY);
      setModelConfig(defaultModelConfig);
    }
  }, [defaultModelConfig]);

  useEffect(() => {
    const wasAvailable = previousAvailabilityRef.current;
    previousAvailabilityRef.current = displayedWebSearchAvailability.available;

    if (!displayedWebSearchAvailability.available) {
      setWebSearchEnabled(false);
      return;
    }

    if (!wasAvailable) {
      setWebSearchEnabled(true);
    }
  }, [displayedWebSearchAvailability.available]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(MODEL_CONFIG_STORAGE_KEY, JSON.stringify(modelConfig));
    } catch {
      // sessionStorage is a convenience cache; failed persistence must not block chat.
    }
  }, [modelConfig]);

  async function submitMessage() {
    const text = input.trim();

    if (text === "" || status === "submitted" || status === "streaming") {
      return;
    }

    setInput("");
    setStreamEvents([]);
    setWorkflowId(null);
    setRefreshWarning(null);
    await sendMessage({ text });
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

    setRuns(runsBody.runs);
    setMessages(mapPersistedMessagesToUI(detailBody.messages, buildRunMap(runsBody.runs)));

    const latestRun = runsBody.runs[0];

    if (latestRun !== undefined) {
      await selectRun(latestRun.id);
    }

    router.refresh();
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
    }
  }

  function markUserScrollIntent() {
    userScrollPausedRef.current = true;

    if (resumeScrollTimerRef.current !== null) {
      clearTimeout(resumeScrollTimerRef.current);
    }

    resumeScrollTimerRef.current = setTimeout(() => {
      userScrollPausedRef.current = false;

      if (statusRef.current === "streaming") {
        scrollMessagesToBottom(messageListRef.current);
      }
    }, USER_SCROLL_RESUME_DELAY_MS);
  }

  function onMessageListScroll() {
    if (autoScrollingRef.current) {
      return;
    }

    markUserScrollIntent();
  }

  function scrollMessagesToBottom(element: HTMLDivElement | null) {
    if (element === null) {
      return;
    }

    autoScrollingRef.current = true;
    element.scrollTop = element.scrollHeight;

    if (autoScrollTimerRef.current !== null) {
      clearTimeout(autoScrollTimerRef.current);
    }

    autoScrollTimerRef.current = setTimeout(() => {
      autoScrollingRef.current = false;
    }, 100);
  }

  return (
    <div className="conversation-grid">
      <section className="chat-pane">
        <section className="chat-surface">
          <p className="meta-line">
            {formatWebSearchAvailabilityLabel(displayedWebSearchAvailability)}
          </p>

          <div
            className="message-list"
            ref={messageListRef}
            onScroll={onMessageListScroll}
            onWheel={markUserScrollIntent}
            onTouchMove={markUserScrollIntent}
            onPointerDown={markUserScrollIntent}
          >
            {messages.map((message) => {
              const linkedRun = runByAssistantMessage.get(message.id);

              return (
                <ConversationMessage
                  key={message.id}
                  message={message}
                  {...(linkedRun !== undefined ? { linkedRun } : {})}
                  onSelectRun={(runId) => {
                    void selectRun(runId);
                  }}
                />
              );
            })}
          </div>

          {error !== undefined ? <p className="form-error">{error.message}</p> : null}
          {refreshWarning !== null ? <p className="form-error">{refreshWarning}</p> : null}
          <ConversationComposer
            input={input}
            status={status}
            webSearchAvailability={displayedWebSearchAvailability}
            webSearchEnabled={webSearchEnabled}
            debugDrawerOpen={debugDrawerOpen}
            onWebSearchEnabledChange={setWebSearchEnabled}
            onDebugOpen={() => setDebugDrawerOpen(true)}
            onInputChange={setInput}
            onSend={() => {
              void submitMessage();
            }}
          />
        </section>
      </section>
      {debugDrawerOpen ? (
        <div className="debug-drawer-shell" role="presentation">
          <button
            className="debug-drawer-backdrop"
            type="button"
            aria-label="关闭调试抽屉"
            onClick={() => setDebugDrawerOpen(false)}
          />
          <aside
            className="debug-drawer"
            id="conversation-debug-drawer"
            aria-label="调试与模型配置"
          >
            <div className="debug-drawer-head">
              <div>
                <span>Debug</span>
                <h2>调试与模型配置</h2>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setDebugDrawerOpen(false)}
              >
                关闭
              </button>
            </div>
            <ModelConfigForm
              value={modelConfig}
              defaultModelConfig={defaultModelConfig}
              apiKeyOverride={apiKeyOverride}
              webSearchAvailability={displayedWebSearchAvailability}
              disabled={status === "submitted" || status === "streaming"}
              onChange={setModelConfig}
              onApiKeyOverrideChange={setApiKeyOverride}
            />
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
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function ModelConfigForm({
  value,
  defaultModelConfig,
  apiKeyOverride,
  webSearchAvailability,
  disabled,
  onChange,
  onApiKeyOverrideChange,
}: {
  value: DebugModelConfig;
  defaultModelConfig: DebugModelConfig;
  apiKeyOverride: string;
  webSearchAvailability: WebSearchAvailability;
  disabled: boolean;
  onChange: (value: DebugModelConfig) => void;
  onApiKeyOverrideChange: (value: string) => void;
}) {
  const mergedCapabilities = {
    ...defaultModelConfig.capabilities,
    ...value.capabilities,
  };
  const toolCallingEnabled = mergedCapabilities.toolCalling === true;

  return (
    <section className="model-config-panel">
      <p className="meta-line">{formatWebSearchAvailabilityLabel(webSearchAvailability)}</p>
      <p className="meta-line">
        toolCalling：
        {toolCallingEnabled ? "已开启" : "未开启（需 OPENAI_MODEL_SUPPORTS_TOOL_CALLING=true）"}
      </p>
      <div className="inline-fields">
        <label className="scope-field">
          <span>Provider</span>
          <select
            className="scope-input"
            value={value.provider}
            disabled={disabled}
            onChange={(event) => {
              const preservedCapabilities = mergedCapabilities;
              onChange(
                event.target.value === "ollama"
                  ? {
                      provider: "ollama",
                      model:
                        value.provider === "ollama"
                          ? value.model
                          : "dzgg/gemma-4-abliterated:e2b-v2",
                      ...(value.provider === "ollama" && value.host !== undefined
                        ? { host: value.host }
                        : value.provider !== "ollama"
                          ? { host: "http://127.0.0.1:11434" }
                          : {}),
                      capabilities: preservedCapabilities,
                    }
                  : {
                      provider: "openai-compatible",
                      model: value.provider === "openai-compatible" ? value.model : "gpt-4o-mini",
                      ...(value.provider === "openai-compatible" && value.baseUrl !== undefined
                        ? { baseUrl: value.baseUrl }
                        : {}),
                      capabilities: preservedCapabilities,
                    },
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

function buildRunMap(runs: WorkflowRunListItem[]): Map<string, WorkflowRunListItem> {
  const map = new Map<string, WorkflowRunListItem>();

  for (const run of runs) {
    if (run.assistantMessageId !== null) {
      map.set(run.assistantMessageId, run);
    }
  }

  return map;
}
