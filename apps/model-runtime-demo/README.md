# @ying-ai/model-runtime-demo

**English** | [简体中文](./README.zh-CN.md)

V1.0 persistent debug workbench + **V1.2 Core Workflow Debug Workbench** + **V1.3 Story Workbench**. Not a shipping user product — a local AI Companion / Story Core debug host: create companions, configure Persona, OpenAI-compatible / Ollama chat, AI SDK UI chat surface, NDJSON streaming, Web Search Sources, Story Mode play, Workflow Timeline, and long-term memory management.

## Environment variables

```txt
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=
OPENAI_FALLBACK_MODEL=
OPENAI_PRIMARY_MAX_RETRIES=1
OPENAI_FALLBACK_MAX_RETRIES=1
OPENAI_MODEL_SUPPORTS_STREAMING=true
OPENAI_MODEL_SUPPORTS_TOOL_CALLING=false
OPENAI_MODEL_SUPPORTS_USAGE=false
OPENAI_FALLBACK_MODEL_SUPPORTS_STREAMING=true
OPENAI_FALLBACK_MODEL_SUPPORTS_TOOL_CALLING=false
OPENAI_FALLBACK_MODEL_SUPPORTS_USAGE=false
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
DATABASE_URL=
MEMORY_POSTGRES_TABLE=companion_memories
WEB_SEARCH_ENABLED=false
WEB_SEARCH_BACKEND=tavily
TAVILY_API_KEY=
```

When `OPENAI_FALLBACK_MODEL` is empty, fallback is disabled. Empty or invalid retry counts are treated as `0`. Empty capability override vars use the OpenAI-compatible adapter defaults: `streaming=true`, `toolCalling=false`, `usage=false`. Only set the corresponding capability explicitly to `true` after confirming the current model and gateway support tool calling or stable usage.

`OLLAMA_KEEP_ALIVE` is passed straight to Ollama and must be a valid duration (e.g. `10m`, `1h`), not bare `10`.
`STORY_MODEL_PROVIDER` can override the Story Workbench provider alone (`openai-compatible` or `ollama`) without changing Companion Workbench `MODEL_PROVIDER`; when unset, Story inherits the global provider.

V1.1 Persona Profile fields live in `debug_companions`:

- `user_display_name TEXT`: user display name;
- `user_address TEXT`: suggested everyday address the companion uses for the user;
- `profile JSONB`: currently includes `hobbies?: string[]`;
- `appearance JSONB`: currently includes `heightCm`, `weightKg`, `hair`, `bodyType`, `additionalTraits`.

The Stage 8 workbench (`/`, `/conversations/*`, `/companions/*`) requires `DATABASE_URL` and `apps/model-runtime-demo/migrations/0001_create_debug_workspace.sql`, otherwise it errors immediately. The long-term memory fallback strategy below applies only to the chat-runtime memory provider and the legacy `/api/chat` debug entry.

Long-term memory provider selection follows this fixed policy (no silent fallback, so “really connected to Postgres” vs “misconfigured” stays distinguishable):

- `DATABASE_URL` missing: in-process `InMemoryMemoryProvider` (lost on restart); panel shows `disabled`;
- `DATABASE_URL` present and health OK: `PostgresMemoryProvider`; panel shows `connected` / pgvector enabled;
- `DATABASE_URL` present but health fails (connection / pgvector / missing table): strictly use demo-level `UnavailableMemoryProvider` (recall/save throw health error); panel shows `error` and the concrete reason; chat still works, and this turn’s `memory:*:end` Observer Events show `ok:false`, so config faults are distinct from “no memories yet”.

Before using PostgreSQL, follow
[`packages/memory-postgres/README.md`](../../packages/memory-postgres/README.md)
to prepare local PostgreSQL + pgvector, and run
`packages/memory-postgres/migrations/0001_create_companion_memories.sql`, ensuring `pgvector` is available,
`companion_memories` exists, and embedding dimensions match `OPENAI_EMBEDDING_MODEL`
(`text-embedding-3-small` → `vector(1536)`). The demo app reads `DATABASE_URL`, creates and holds
`pg.Pool`, then injects `PostgresMemoryProvider`; the provider neither creates nor closes the pool.

Health is refreshed by `GET /api/memory-health` on page load and after each chat turn, and written to a process-level snapshot; the chat request path only reads that snapshot to choose a provider and no longer probes the DB (patch-0 §8/§11.4). On cold start with no snapshot yet, chat optimistically uses Postgres; real recall/save errors surface via Observer, and the next health refresh aligns the panel.

## Local run

```bash
cp apps/model-runtime-demo/.env.example apps/model-runtime-demo/.env
pnpm --filter @ying-ai/model-runtime-demo dev
```

Shortest path to real PostgreSQL memory:

```bash
createdb ying_companion_dev
psql -d ying_companion_dev -f packages/memory-postgres/migrations/0001_create_companion_memories.sql
psql -d ying_companion_dev -f apps/model-runtime-demo/migrations/0001_create_debug_workspace.sql
psql -d ying_companion_dev -f apps/model-runtime-demo/migrations/0002_extend_debug_companion_persona.sql
psql -d ying_companion_dev -f apps/model-runtime-demo/migrations/0003_add_web_search_settings.sql
```

`0003_add_web_search_settings.sql` also includes the unique index on assistant messages for `debug_workflow_runs`.
Story Workbench reuses the same `DATABASE_URL` and demo-owned `pg.Pool`; entering `/stories`
runs `runStoryPostgresMigrations()` to ensure `story_sessions` / `story_states` /
`story_turns` / `story_messages` / `story_summaries` exist. To run explicitly:

```bash
pnpm --filter @ying-ai/story-postgres migrate
```

`debug_conversations.web_search_enabled` is not yet read as a persisted user setting; the V1.2 composer Web Search switch lives only in current browser page state and restores defaults from host availability after refresh.

Then fill `OPENAI_API_KEY`, `OPENAI_MODEL`, and `DATABASE_URL` in `apps/model-runtime-demo/.env`. To enable Web Search:

```txt
WEB_SEARCH_ENABLED=true
WEB_SEARCH_BACKEND=tavily
TAVILY_API_KEY=...
OPENAI_MODEL_SUPPORTS_TOOL_CALLING=true
```

Local default:

```txt
DATABASE_URL=postgresql://localhost:5432/ying_companion_dev
```

The first companion read/write auto-fills V1.1 Persona Profile columns so older local DBs keep working; new environments and CI should still run the migrations above explicitly so schema versions stay auditable.

Open the local URL printed by Next.js:

- `/`: conversation history list. Pick an existing companion to create a new session, or go to companion creation.
- `/stories`: Story Workbench entry. Shows stories in the current-process Registry; validate and register Story Definition JSON.
- `/stories/[storyId]/sessions`: Story Session list and new-save entry. Session creation freezes `definitionSnapshot`; later restore does not read updated seed definitions.
- `/stories/[storyId]/sessions/[sessionId]`: Story Runtime. Send free-text actions; observe streamed narrative, Core State, dynamic attrs rendered from Attribute Schema, Narrative Summary, Lore / Plan / State / Timeline Debug.
- `/companions/new`, `/companions/[id]/edit`: configure Persona (user display name, suggested address, hobbies, appearance, extra instructions); server injects the latest config into `DefaultPersonaProvider` each chat turn.
- `/conversations/[id]`: AI SDK UI chat surface is the default main view; the composer “Debug” button opens a drawer with model config and `RunDebugPanel`. Web Search switch is left of Send; Debug is beside Send; after refresh, messages, emotion, summary, and historical runs restore; Sources cards for the current streaming turn come from structured `web_search` ToolResult, not URL parsing from model prose.
- `/companions/[id]/memories`: long-term memory CRUD. Create/update content re-embeds; list does not show score — score only appears in this turn’s recalled memories on the conversation page.
- `/debug/model-runtime`: stage 1 Model Runtime standalone verification — Provider inspection, streaming output, final model used, whether fallback ran, attempt counts, error summaries.

Conversation sends go through `POST /api/conversations/[id]/messages` with response
`application/x-ndjson; charset=utf-8`. The client uses AI SDK UI `useChat` + custom
`DemoChatTransport` to submit `message`, optional non-sensitive `modelConfig`, page-level
`webSearchEnabled`, and request-only `apiKeyOverride`. Missing
`webSearchEnabled` is treated as `false` on the server to avoid accidental networking from old callers. The server builds
`scope`, history, emotion, summaryScope, and Providers from conversation / companion, calls `core.streamWorkflow()`, and maps Core
Events to Wire Events via the single mapping in `app/lib/chat-stream-wire.ts`. Except
`workflow:finish`, events are written to NDJSON in real time; browser-side `app/lib/chat-stream-ui-adapter.ts`
maps `text:delta`, `tool:call`, `tool:result`, `workflow:*` into AI SDK UI message parts, while raw Wire Events continue into `RunDebugPanel` on the side. `workflow:finish` is sent only after
`DebugRepository.completeRun()` successfully writes back assistant message, workflow run, conversation
emotion, and preview. Legacy `POST /api/chat` remains a non-streaming debug entry and does not carry the
V1.2 workbench main path.

V1.1 stage-07 wired the persisted conversation Route to `POST + fetch + ReadableStream + NDJSON`.
`app/lib/chat-stream-transport.ts` provides NDJSON encoding, browser incremental parsing, and Wire Event runtime
guards covering half-lines, multi-lines, invalid JSON, and events after a terminal event.

V1.2 stage-02 keeps that backend protocol and does not switch to `streamText()` / `toUIMessageStreamResponse()`.
Main chat message state is managed by `@ai-sdk/react` `useChat`; `DemoChatTransport` forwards the AI SDK
`AbortSignal` to `fetch`, but the UI does not show Stop because this stage does not promise server-resumable workflow
cancellation semantics.

The chat message list auto-scrolls to bottom only while an assistant message is in `streaming` generation; submit phase, post-generation persistence refresh, and history restore do not force stick-to-bottom. When the user scrolls, touches, or uses pointer on the message list, auto-scroll pauses; after 2 seconds of idle scroll it resumes stick-to-bottom only if the current turn is still generating.

The V1.1 stage-07 workbench can pick `openai-compatible` or `ollama` in the debug drawer. Non-sensitive model config is stored in browser `sessionStorage` and sent with each POST body; OpenAI-compatible `apiKeyOverride` lives only in current-page React state and that single POST body — never in the database, Wire Event, trace, or Debug Panel. Model creation still happens in the host-side strategy registry and does not change `ai-core` Workflow.

Long-term memory extraction follows the current chat model: OpenAI-compatible uses Vercel AI SDK structured output for `ModelMemoryExtractor` object results; Ollama uses `format: "json"` then the same Zod schema validation. Write and recall remain owned by the demo-injected `MemoryProvider`, so Ollama only replaces chat/extract models and does not provide embedding or DB; `OPENAI_EMBEDDING_MODEL` and `DATABASE_URL` still decide whether real long-term memory can persist.

Local contract samples live in `app/lib/chat-stream-contract-verifier.ts`, covering normal completion, blank delta, unsupported stream, step failure, output safety reject, memory write-back degradation, and Wire serialization boundaries. Reproduce in the console with:

```bash
pnpm --filter @ying-ai/model-runtime-demo verify:stream-contract
pnpm --filter @ying-ai/model-runtime-demo verify:chat-ui-adapter
```

- **Memory DB Panel**: provider meta, DB / pgvector / table status, embedding model and vector dims, recall (with score).
- **Rolling summary**: Stage 8 workbench wires `debug_conversation_summaries` persistence but defaults off; when enabled it survives dev server restart.
- **Prompt / Context Debug Panel**: from `ChatWorkflowOutput.metadata.debugContext` — Effective Persona, Persona Prompt Preview, final system prompt, Conversation Summary, long-term memory blocks, Recent History, current user input. With rolling summary on, focus on `summaryContext`, `recentHistory`, `summarizedMessages`, Conversation Summary, Updated Summary, and Summary Events.
- **Tools Panel**: demo host explicitly injects `LocalToolRegistry` with default tools `get_current_time`, `search_memory`, `get_emotion_state`; `get_current_time` always returns `Asia/Shanghai` Beijing time and matching UTC ISO; panel shows registered tools, model-requested tool calls, execution results, whether follow-up generation ran, and tool observer events.
- **scope isolation**: workbench fixes `ownerType=custom`, `ownerId=local-debug-owner`; long-term memory is isolated by `owner + companion`; deleting a conversation does not delete long-term memory.

## Story Workbench (V1.3)

Story sends go through `POST /api/story-sessions/[id]/messages` with response
`application/x-ndjson; charset=utf-8`. The server builds the runtime centrally via `app/lib/story-runtime-factory.ts`:
read `DATABASE_URL`, create / reuse the demo pool, run story-postgres migrations, inject
`PostgresStorySessionProvider`, `PostgresStoryStateProvider`, `PostgresStoryTurnRepository`,
`PostgresStoryMessageProvider`, `PostgresStoryTurnCommitter`, and `PostgresStorySummaryProvider`.
Routes do not assemble providers directly and never mix a persisted state provider with in-memory turn/message providers.

Story list, save list, and restore pages only initialize the DB Host and do not require a working model. Sending a turn creates the model workflow on demand from
`STORY_MODEL_PROVIDER` (or inherited `MODEL_PROVIDER`) and the matching OpenAI-compatible / Ollama
env vars. Each new turn defaults to two model calls: `ModelStoryPlanner` first produces a structured `StoryTurnPlan`; after validation, `ModelStoryRenderer` streams player-visible prose. Runtime Debug `model` shows current provider, model, and capability claims — never the API Key.

Streaming path:

```txt
DefaultStoryWorkflow.stream()
→ Story Core Event
→ app/lib/story-stream-wire.ts
→ Story Wire Event
→ app/lib/story-stream-transport.ts NDJSON
→ app/lib/story-stream-ui-adapter.ts + Runtime Debug panel
```

The Wire layer converts `Date` to ISO strings and explicitly maps error / raw / unknown payloads to JSON-safe data; the browser runtime guard rejects streams missing a terminal event or that still emit business events after a terminal event.
`story:finish` is sent only after the workflow has already emitted finish. Successful turns re-read
`GET /api/story-sessions/[id]` for latest `messages / latestState / summary / definitionVersion`; failed turns also refresh persisted state but keep `failed` / `validation_failed` status and this turn’s input — they do not pretend success.

Resubmitting the same `clientTurnId` returns the committed turn’s canonical assistant text, turnId, and revision without re-running Lore / Planner / Validator / Renderer, writing Summary, or inserting messages. Wire and UI metadata both carry `idempotentReplay`; the page labels that success terminal as “replay of committed turn”.

Current Story Wire is a Demo Debug protocol: `story:lore-recalled` carries full `planner_only` Lore so developers can explain recall and visibility decisions. It is not a product public protocol; when `apps/web` adopts Story Mode it must use a separate mapping and must not pass `planner_only.content` to end users.

The state sidebar splits fixed Core State and Dynamic Attributes. attrs rendering comes entirely from
`StoryDefinition.attributes[]` via `createStoryAttributeStorageKey()`:
`story`, `player`, `character`, and `scene` scopes share one renderer; fields with `showInSidebar=false`
stay out of the default sidebar but remain visible in Debug. `relationships` show only when enabled in the Definition.

Planner receives raw player input, the frozen Story Definition’s public projection, current State, Narrative Summary, recent messages, and this turn’s recalled Lore. Full `lore`, character private backgrounds, and secrets never enter the model via the Definition projection — only via gated `recalledLore` into Planner; Renderer receives the validated Plan, nextState, and visible Lore, continuing recent actions and dialogue. Ordinary narration or dialogue may use `stateChanges=[]` but must still produce natural in-scene feedback and must not rewrite into preset investigation behavior.
Offline Fake Model / Planner / Renderer exist only for contract verification scripts and do not enter the Story Workbench production path.

The Debug panel distinguishes `live` vs `persisted` sources. During send, Wire Events show Effective Context, Recent Messages, Lore, Plan, Accepted / Rejected Changes, and full Timeline; on first load or refresh, committed lifecycle is restored from committed Turn, Messages, Summary, State, and Definition Snapshot — without inventing precise timestamps for historical live events.

JSON import validates Definition first, then registers into the current Demo process Story Registry. Same-content re-import is idempotent; conflicting content for the same id returns 409 without overwrite. Registry clears on restart; already-created Sessions keep a full `definitionSnapshot` and can restore without being rewritten by later imports or seed upgrades.

Automated contract verification:

```bash
pnpm --filter @ying-ai/story-core verify:story-contract
pnpm --filter @ying-ai/story-core verify:story-workflow
pnpm --filter @ying-ai/story-postgres verify:story-postgres
pnpm --filter @ying-ai/story-postgres verify:story-recovery
pnpm --filter @ying-ai/model-runtime-demo verify:story-stream-contract
pnpm --filter @ying-ai/model-runtime-demo verify:story-ui-adapter
pnpm --filter @ying-ai/model-runtime-demo verify:story-workbench-planner
pnpm --filter @ying-ai/model-runtime-demo verify:story-workbench-data
```

Minimum manual acceptance:

```txt
A. /stories shows 雾港疑云 and 青崖试剑; valid JSON registers into the current-process story list immediately; invalid or conflicting definitions never enter the Registry
B. New 雾港 Session → Runtime shows openingText, current scene, and initial attrs
C. Consecutive free actions or dialogue → replies continue from actual input and previous turn; text deltas display; Debug shows Lore / Plan / Timeline / model / committed revision
D. Explicit investigate / talk / move → only items, events, scenes, or attrs supported by Definition and context advance via StateChange
E. New 青崖试剑 Session → sidebar shows combatPower / sectStanding, not 雾港 fields
F. Refresh Runtime page → messages / state / revision / definitionVersion and persisted Debug Plan / Lore / changes restore from Postgres
G. Automated validator-failure contract → UI Adapter shows validation failed; world state not polluted
H. No valid model config → send shows a clear error; story list and existing saves remain browsable
I. Replay committed request with same clientTurnId → shows “replay of committed turn”; body, turnId, and revision stay canonical; DB adds no new messages
```

## Web Search (V1.2)

The composer switch is available only when all three prerequisites hold:

```txt
WEB_SEARCH_ENABLED=true
WEB_SEARCH_BACKEND=tavily and TAVILY_API_KEY is valid
current model capabilities.toolCalling=true
```

The switch only means “Planner may see web_search this turn”; whether a search actually runs is still decided by
`ToolPlanningProvider`. With the switch off, this request does not register / inject `web_search`.
Sources after a successful search come from structured `WebSearchResult` in `tool:result`; failure, empty results, or no search never invent sources. Full retrieval params and fallback are recorded in the Debug Workbench Web Search Log.

## Chat status (V1.2)

Each assistant turn on the conversation page may be in:

| Status                   | Meaning                                                                     |
| ------------------------ | --------------------------------------------------------------------------- |
| `success`                | Stream completed and persistence succeeded                                  |
| `degraded`               | Main reply completed; post Memory / Emotion / Summary steps degraded        |
| `submitted`              | Request submitted                                                           |
| `planning_tool`          | Deciding whether tools are needed                                           |
| `searching`              | Planner chose `web_search`; searching the Web                               |
| `streaming`              | Receiving `text:delta`                                                      |
| `partial_failed`         | Partial `text:delta` received but never completed (no `workflow:finish`)    |
| `output_safety_rejected` | Full-text output safety rejected                                            |
| `persistence_failed`     | Model output generated but DB persistence failed; may be lost after refresh |
| `tool_failed`            | Search or other tool failed; later model may still give a degraded answer   |
| `failed`                 | Failed before first delta or no displayable text                            |

`workflow:finish` is sent only after `DebugRepository.completeRun()` succeeds; persistence failure goes through `workflow:error` + `details.reason=persistence_failed`.

## V1.2 manual acceptance

Main path (needs valid API key / local Ollama + optional Postgres):

```txt
A. Persona: /companions/[id]/edit configure userAddress, hobbies, appearance → Prompt Preview sections correct
B. OpenAI streaming: /conversations/[id] send message → AI SDK UI messages update incrementally and auto stick-to-bottom only during assistant streaming → composer Debug button opens full debug panel
C. Ollama streaming: conversation page provider=ollama → streamed reply; runtime shows ollama model name
D. Ollama memory write-back: with Postgres memory enabled, send a clear long-term event → Memory Events show extract/save success
E. Tool planning: register tools + toolCalling-capable model → Timeline distinguishes plan / call / result / delta
F. Web Search: configure Tavily + toolCalling=true → switch left of Send available; networked questions show search status and Sources
G. Web Search off: switch off → this turn does not register web_search; no fake Sources
H. Fallback: configure fallback model → runtime shows actual model used and capability skip
I. Safety / partial: see verify:stream-contract scenarios; UI label copy needs local confirmation
J. NDJSON: pnpm verify:stream-contract (chunk boundaries, raw stripping)
K. UI Adapter: pnpm verify:chat-ui-adapter (delta, Sources, errors, protocol mismatches)
L. Engineering: pnpm typecheck && pnpm lint && pnpm build
```

Automated contract verification:

```bash
pnpm --filter @ying-ai/model-runtime-demo verify:stream-contract
pnpm --filter @ying-ai/model-runtime-demo verify:chat-ui-adapter
pnpm --filter @ying-ai/tool-web-search verify:web-search-contract
pnpm --filter @ying-ai/model-runtime-demo verify:web-search-workflow
pnpm --filter @ying-ai/model-ollama verify:adapter
```

Acceptance record: [`.code-reviews/companion/v1.1/acceptance/manual-verification.md`](../../.code-reviews/companion/v1.1/acceptance/manual-verification.md)

## V1.0 persistence acceptance (still valid)

```txt
1. Open /, create a companion, then create a conversation with that companion.
2. On /conversations/[id] send two turns, refresh, confirm history messages, emotion, and left-side runs still exist.
3. Go to /companions/[id]/memories, manually add a preference memory, then in a new conversation with the same companion ask a related question and confirm left-side recalled memories show that memory and score.
4. Delete that conversation; confirm it disappears from /; re-open the same companion’s memory page and confirm long-term memory still exists.
5. Open /debug/model-runtime and confirm the stage 1 model runtime verification entry still works.
```
