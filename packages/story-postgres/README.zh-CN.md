# @ying-ai/story-postgres

**[English](./README.md)** | 简体中文

`@ying-ai/story-postgres` 是 V1.3 Story Mode 的 PostgreSQL 持久化适配器。Host 注入 `pg.Pool` 或 `PoolClient`；本包不读取环境变量，验证脚本才会使用 `DATABASE_URL`。

## Host 接入

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

沿用 Demo / memory-postgres 的 `DATABASE_URL + pg.Pool` 模式，不新增 env 名。
`apps/model-runtime-demo` 的 Story Runtime Factory 会持有同一个 pool，并一次性注入
Session / State / TurnRepository / Message / Committer / Summary Provider；不要在 route 内只临时创建部分 provider 后回退到 in-memory。

业务回合提交应走 `PostgresStoryTurnCommitter`。`PostgresStoryStateProvider.saveState()` 仅用于开档初始化或宿主维护工具；需要直接保存时应传入 `expectedRevision`，以启用 revision CAS：

```ts
await stateProvider.saveState(sessionId, nextState, { expectedRevision: current.revision });
```

## 表职责

- `story_sessions`：session 元数据与冻结的 `definition_snapshot`
- `story_states`：完整规范化 `StoryState` JSON，表名不是 `story_session_states`
- `story_turns`：committed turn 记录与 `client_turn_id` 幂等约束
- `story_messages`：每个 committed turn 固定 user + assistant 两条消息
- `story_summaries`：Narrative Summary 与 version 并发保护

开档时从 `StoryProvider` 读取 Definition，校验后深拷贝入 `definition_snapshot`。后续回合只读取 snapshot；种子故事升级不会改写旧存档。

## 提交语义

V1.3 默认不预写 `processing` turn，也不实现队列、超时恢复或同 Session 自动串行化。成功回合在单一事务内：

```txt
lock current state revision
→ confirm clientTurnId is not already committed
→ insert/update committed story_turn
→ insert user + assistant messages
→ CAS update story_states revision = previous + 1
→ update story_sessions.updated_at
```

同一 `sessionId + clientTurnId`：

- 已有 `committed`：直接返回旧 Turn，不推进 revision。
- 已有 `failed`：允许同 id 重试，并在成功时覆盖为 committed。
- 默认实现不写 failed turn；失败不会污染 state/messages。

每个成功 committed turn 都推进 `StoryState.revision + 1`，即使没有业务状态变化。业务变化用 `stateChanged` 记录。

数据库层只负责返回 canonical committed turn；是否为重放的可观测标记与 canonical assistant text
由 Story Workflow/Core Event 暴露给宿主。该补充不改变唯一约束、事务边界或消息数量语义。

## 验证

```bash
pnpm --filter @ying-ai/story-postgres typecheck
pnpm --filter @ying-ai/story-postgres build
pnpm --filter @ying-ai/story-postgres lint
pnpm --filter @ying-ai/story-postgres verify:story-postgres
pnpm --filter @ying-ai/story-postgres verify:story-recovery
```

验证脚本使用 `DATABASE_URL`，未设置时默认连接 `postgresql://localhost:5432/ying_companion_dev`。覆盖 migration、Definition Snapshot、原子提交、clientTurnId 幂等、failed turn 同 id 重试、revision CAS、Summary version conflict 与多轮重启恢复。
