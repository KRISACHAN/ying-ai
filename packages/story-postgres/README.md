# @ying-ai/story-postgres

**English** | [简体中文](./README.zh-CN.md)

`@ying-ai/story-postgres` is the PostgreSQL persistence adapter for V1.3 Story Mode. The Host injects a `pg.Pool` or `PoolClient`; this package does not read environment variables — only verification scripts use `DATABASE_URL`.

## Host integration

```ts
import { Pool } from "pg";
import {
  PostgresStorySessionProvider,
  PostgresStoryStateProvider,
  PostgresStoryTurnCommitter,
  runStoryPostgresMigrations,
} from "@ying-ai/story-postgres";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await runStoryPostgresMigrations(pool);
```

Follows the Demo / memory-postgres `DATABASE_URL + pg.Pool` pattern with no new env names.
The Story Runtime Factory in `apps/model-runtime-demo` holds one shared pool and injects
Session / State / TurnRepository / Message / Committer / Summary Providers in one shot; do not temporarily create only some providers inside a route and fall back to in-memory.

Business turn commits should go through `PostgresStoryTurnCommitter`. `PostgresStoryStateProvider.saveState()` is only for save-slot initialization or host maintenance tools; when saving directly, pass `expectedRevision` to enable revision CAS:

```ts
await stateProvider.saveState(sessionId, nextState, { expectedRevision: current.revision });
```

## Table responsibilities

- `story_sessions`: session metadata and frozen `definition_snapshot`
- `story_states`: full normalized `StoryState` JSON — the table is not named `story_session_states`
- `story_turns`: committed turn records and `client_turn_id` idempotency constraint
- `story_messages`: fixed user + assistant message pair per committed turn
- `story_summaries`: Narrative Summary with version concurrency protection

On save-slot creation, Definition is read from `StoryProvider`, validated, and deep-copied into `definition_snapshot`. Later turns only read the snapshot; seed-story upgrades do not rewrite old saves.

## Commit semantics

V1.3 by default does not pre-write a `processing` turn, and does not implement queues, timeout recovery, or automatic same-Session serialization. A successful turn runs in a single transaction:

```txt
lock current state revision
→ confirm clientTurnId is not already committed
→ insert/update committed story_turn
→ insert user + assistant messages
→ CAS update story_states revision = previous + 1
→ update story_sessions.updated_at
```

For the same `sessionId + clientTurnId`:

- Existing `committed`: return the old Turn immediately; do not advance revision.
- Existing `failed`: same-id retry is allowed and overwrites to committed on success.
- The default implementation does not write failed turns; failures do not pollute state/messages.

Every successful committed turn advances `StoryState.revision + 1`, even with no business-state change. Business changes are recorded via `stateChanged`.

The database layer only returns the canonical committed turn; the observability flag for replay and the canonical assistant text are exposed to the host by Story Workflow / Core Events. That addition does not change unique constraints, transaction boundaries, or message-count semantics.

## Verification

```bash
pnpm --filter @ying-ai/story-postgres typecheck
pnpm --filter @ying-ai/story-postgres build
pnpm --filter @ying-ai/story-postgres lint
pnpm --filter @ying-ai/story-postgres verify:story-postgres
pnpm --filter @ying-ai/story-postgres verify:story-recovery
```

Verification scripts use `DATABASE_URL`, defaulting to `postgresql://localhost:5432/ying_companion_dev` when unset. Coverage includes migration, Definition Snapshot, atomic commit, clientTurnId idempotency, failed-turn same-id retry, revision CAS, Summary version conflict, and multi-turn restart recovery.
