"use client";

import type {
  StoryAttributeDefinition,
  StoryDefinition,
  StoryMessage,
  StoryNarrativeSummary,
  StoryState,
  StoryTurn,
} from "@ying-companion/story-core";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createStoryAttributeStorageKey } from "./lib/story-attribute-key";
import { parseStoryNdjsonWireEvents, StoryStreamProtocolError } from "./lib/story-stream-transport";
import type { StoryWorkflowStreamWireEvent } from "./lib/story-stream-wire";
import { StoryStreamUIAdapter, type StoryTurnStatus } from "./lib/story-stream-ui-adapter";
import type { StoryModelRuntimeInfo } from "./lib/story-runtime-factory";

export interface StoryRuntimeInitialDetail {
  session: {
    id: string;
    storyId: string;
    definitionVersion: string;
  };
  definition: StoryDefinition;
  state: StoryState;
  messages: StoryMessage[];
  turns: StoryTurn[];
  summary: StoryNarrativeSummary | null;
  modelRuntime: StoryModelRuntimeInfo;
}

interface RuntimeMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
}

export function StoryRuntimeWorkspace({
  initialDetail,
}: {
  initialDetail: StoryRuntimeInitialDetail;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialDetail.state);
  const [messages, setMessages] = useState<RuntimeMessage[]>(() =>
    toRuntimeMessages(initialDetail.definition, initialDetail.messages),
  );
  const [summary, setSummary] = useState(initialDetail.summary);
  const [turns, setTurns] = useState(initialDetail.turns);
  const [wireEvents, setWireEvents] = useState<StoryWorkflowStreamWireEvent[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<StoryTurnStatus>("success");
  const [error, setError] = useState<string | null>(null);
  const currentScene = useMemo(
    () =>
      initialDetail.definition.scenes.find((scene) => scene.id === state.currentSceneId) ?? null,
    [initialDetail.definition.scenes, state.currentSceneId],
  );

  async function send() {
    const message = input.trim();
    if (message === "" || status === "submitted" || status === "streaming") {
      return;
    }

    const clientTurnId = `story_ui_${crypto.randomUUID()}`;
    const assistantId = `assistant_${clientTurnId}`;
    setInput("");
    setError(null);
    setWireEvents([]);
    setStatus("submitted");
    setMessages((current) => [
      ...current,
      { id: `user_${clientTurnId}`, role: "user", content: message },
      { id: assistantId, role: "assistant", content: "" },
    ]);

    const adapter = new StoryStreamUIAdapter();

    try {
      const response = await fetch(`/api/story-sessions/${initialDetail.session.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, clientTurnId }),
      });

      if (!response.ok || response.body === null) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? "Story request failed");
      }

      for await (const event of parseStoryNdjsonWireEvents(response.body)) {
        setWireEvents((current) => [...current, event]);
        const chunks = adapter.consume(event);
        for (const chunk of chunks) {
          if (chunk.type === "text-delta") {
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantId ? { ...item, content: item.content + chunk.delta } : item,
              ),
            );
          }
          if (chunk.type === "message-metadata") {
            const metadata = chunk.messageMetadata as { turnStatus?: StoryTurnStatus };
            if (metadata.turnStatus) {
              setStatus(metadata.turnStatus);
            }
          }
        }
        if (event.type === "story:error") {
          setError(`${event.error.code}: ${event.error.message}`);
        }
      }

      await refreshDetail();
      router.refresh();
    } catch (caught) {
      const messageText =
        caught instanceof StoryStreamProtocolError || caught instanceof Error
          ? caught.message
          : "Story request failed";
      setError(messageText);
      setStatus("failed");
    }
  }

  async function refreshDetail() {
    const response = await fetch(`/api/story-sessions/${initialDetail.session.id}`, {
      cache: "no-store",
    });
    const body = (await response.json()) as {
      ok: boolean;
      latestState?: StoryState;
      recentMessages?: StoryMessage[];
      turns?: StoryTurn[];
      summary?: StoryNarrativeSummary | null;
    };
    if (!body.ok || body.latestState === undefined || body.recentMessages === undefined) {
      return;
    }
    setState(body.latestState);
    setMessages(toRuntimeMessages(initialDetail.definition, body.recentMessages));
    setTurns(body.turns ?? []);
    setSummary(body.summary ?? null);
    setStatus("success");
  }

  return (
    <div className="story-runtime-grid">
      <section className="chat-pane story-chat-pane">
        <div className="message-list">
          {messages.map((message) => (
            <article
              className={`message-bubble ${
                message.role === "user" ? "message-user" : "message-assistant"
              }`}
              key={message.id}
            >
              <span>
                {message.role === "system" ? "Opening" : message.role === "user" ? "你" : "Story"}
              </span>
              <p>{message.content}</p>
            </article>
          ))}
        </div>
        <div className="story-composer">
          <textarea
            className="chat-input"
            rows={4}
            value={input}
            disabled={status === "submitted" || status === "streaming"}
            onChange={(event) => setInput(event.target.value)}
          />
          <div className="toolbar-actions">
            <button
              className="button"
              type="button"
              disabled={input.trim() === "" || status === "submitted" || status === "streaming"}
              onClick={send}
            >
              {status === "submitted" || status === "streaming" ? "生成中" : "发送行动"}
            </button>
            <span className="meta-line">状态：{status}</span>
          </div>
          {error !== null ? <p className="form-error">{error}</p> : null}
        </div>
      </section>

      <aside className="story-sidebar">
        <section className="debug-section">
          <h3>Current State</h3>
          <dl className="story-state-list">
            <dt>当前场景</dt>
            <dd>{currentScene?.title ?? state.currentSceneId}</dd>
            <dt>revision</dt>
            <dd>{state.revision}</dd>
            <dt>definitionVersion</dt>
            <dd>{initialDetail.session.definitionVersion}</dd>
          </dl>
        </section>
        <CoreStatePanel definition={initialDetail.definition} state={state} />
        <DynamicAttributesPanel definition={initialDetail.definition} state={state} sidebarOnly />
      </aside>

      <section className="story-debug-pane">
        <StoryDebugPanel
          definition={initialDetail.definition}
          state={state}
          turns={turns}
          summary={summary}
          wireEvents={wireEvents}
          modelRuntime={initialDetail.modelRuntime}
        />
      </section>
    </div>
  );
}

function CoreStatePanel({ definition, state }: { definition: StoryDefinition; state: StoryState }) {
  const inventory = labelsFor(definition.items, state.inventory);
  const clues = labelsFor(definition.clues, state.clues);
  const events = labelsFor(definition.events, state.events);
  const present = Object.entries(state.characters)
    .filter(([, value]) => value.present)
    .map(([id]) => definition.characters.find((character) => character.id === id)?.name ?? id);

  return (
    <section className="debug-section">
      <h3>Core State</h3>
      <StateList label="在场角色" values={present} />
      <StateList label="物品" values={inventory} />
      <StateList label="线索" values={clues} />
      <StateList label="事件" values={events} />
      {definition.relationshipsEnabled && state.relationships ? (
        <StateList
          label="关系"
          values={Object.entries(state.relationships).map(([id, value]) => `${id}: ${value}`)}
        />
      ) : null}
    </section>
  );
}

function DynamicAttributesPanel({
  definition,
  state,
  sidebarOnly,
}: {
  definition: StoryDefinition;
  state: StoryState;
  sidebarOnly?: boolean;
}) {
  const entries = resolveAttributeRows(definition, state, sidebarOnly ?? false);

  return (
    <section className="debug-section">
      <h3>Dynamic Attributes</h3>
      <div className="story-attr-list">
        {entries.map((entry) => (
          <div className="story-attr-row" key={entry.storageKey}>
            <span>{entry.label}</span>
            <strong>{String(entry.value ?? "未设置")}</strong>
            <small>{entry.storageKey}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function StoryDebugPanel({
  definition,
  state,
  turns,
  summary,
  wireEvents,
  modelRuntime,
}: {
  definition: StoryDefinition;
  state: StoryState;
  turns: StoryTurn[];
  summary: StoryNarrativeSummary | null;
  wireEvents: StoryWorkflowStreamWireEvent[];
  modelRuntime: StoryModelRuntimeInfo;
}) {
  const latestPlan = payloadFor(wireEvents, "story:plan-completed");
  const latestLore = payloadFor(wireEvents, "story:lore-recalled");
  const latestPrepared = payloadFor(wireEvents, "story:state-prepared");
  const latestRejected = payloadFor(wireEvents, "story:validation-failed");

  return (
    <>
      <section className="debug-section">
        <h3>Story Definition Preview</h3>
        <pre className="output">{JSON.stringify(createDefinitionDebug(definition), null, 2)}</pre>
      </section>
      <section className="debug-section">
        <h3>Narrative Summary</h3>
        <pre className="output">{summary?.text ?? "暂无摘要"}</pre>
      </section>
      <section className="debug-section">
        <h3>Recalled Lore</h3>
        <pre className="output">{JSON.stringify(latestLore ?? {}, null, 2)}</pre>
      </section>
      <section className="debug-section">
        <h3>Story Planner Output</h3>
        <pre className="output">{JSON.stringify(latestPlan ?? {}, null, 2)}</pre>
      </section>
      <section className="debug-section">
        <h3>Accepted / Rejected Changes</h3>
        <pre className="output">
          {JSON.stringify(
            {
              accepted: latestPrepared,
              rejected: latestRejected,
            },
            null,
            2,
          )}
        </pre>
      </section>
      <section className="debug-section">
        <h3>Workflow Timeline</h3>
        <pre className="output">
          {JSON.stringify(
            wireEvents.map((event) => ({
              type: event.type,
              sequence: event.sequence,
              occurredAt: event.occurredAt,
            })),
            null,
            2,
          )}
        </pre>
      </section>
      <section className="debug-section">
        <h3>Runtime</h3>
        <pre className="output">
          {JSON.stringify(
            {
              model: modelRuntime,
              stateRevision: state.revision,
              turns: turns.map((turn) => ({
                id: turn.id,
                clientTurnId: turn.clientTurnId,
                turnNumber: turn.turnNumber,
                status: turn.status,
              })),
            },
            null,
            2,
          )}
        </pre>
      </section>
      <DynamicAttributesPanel definition={definition} state={state} />
    </>
  );
}

function toRuntimeMessages(
  definition: StoryDefinition,
  persistedMessages: StoryMessage[],
): RuntimeMessage[] {
  const opening: RuntimeMessage = {
    id: "opening",
    role: "system",
    content: definition.openingText,
  };
  return [
    opening,
    ...persistedMessages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    })),
  ];
}

function payloadFor(events: StoryWorkflowStreamWireEvent[], type: string) {
  const event = [...events].reverse().find((candidate) => candidate.type === type);
  return event && "payload" in event ? event.payload : null;
}

function resolveAttributeRows(
  definition: StoryDefinition,
  state: StoryState,
  sidebarOnly: boolean,
): Array<{ label: string; storageKey: string; value: unknown }> {
  return definition.attributes
    .filter((attribute) => !sidebarOnly || attribute.showInSidebar === true)
    .flatMap((attribute) =>
      scopeRefs(definition, state, attribute).map((scopeRef) => {
        const storageKey = createStoryAttributeStorageKey({ definition: attribute, scopeRef });
        return {
          label: labelForAttribute(definition, attribute, scopeRef),
          storageKey,
          value: state.attrs[storageKey],
        };
      }),
    );
}

function scopeRefs(
  definition: StoryDefinition,
  state: StoryState,
  attribute: StoryAttributeDefinition,
): Array<string | undefined> {
  if (attribute.scope === "story" || attribute.scope === "player") {
    return [undefined];
  }
  if (attribute.scope === "character") {
    return (attribute.characterIds ?? Object.keys(state.characters)).filter((characterId) =>
      definition.characters.some((character) => character.id === characterId),
    );
  }
  return [state.currentSceneId];
}

function labelForAttribute(
  definition: StoryDefinition,
  attribute: StoryAttributeDefinition,
  scopeRef: string | undefined,
): string {
  if (!scopeRef) {
    return attribute.label;
  }
  const character = definition.characters.find((item) => item.id === scopeRef);
  const scene = definition.scenes.find((item) => item.id === scopeRef);
  return `${character?.name ?? scene?.title ?? scopeRef} · ${attribute.label}`;
}

function StateList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="story-state-group">
      <strong>{label}</strong>
      <span>{values.length > 0 ? values.join(" / ") : "无"}</span>
    </div>
  );
}

function labelsFor<T extends { id: string }>(catalog: T[], ids: string[]): string[] {
  return ids.map((id) => {
    const item = catalog.find((candidate) => candidate.id === id);
    if (item && "title" in item && typeof item.title === "string") {
      return item.title;
    }
    if (item && "name" in item && typeof item.name === "string") {
      return item.name;
    }
    return id;
  });
}

function createDefinitionDebug(definition: StoryDefinition) {
  return {
    title: definition.title,
    premise: definition.premise,
    genre: definition.genre,
    characters: definition.characters.map((character) => ({
      id: character.id,
      name: character.name,
      role: character.narrativeRole,
    })),
    scenes: definition.scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      availableCharacterIds: scene.availableCharacterIds,
    })),
    attributes: definition.attributes,
    narrativeRules: definition.narrativeRules,
  };
}
