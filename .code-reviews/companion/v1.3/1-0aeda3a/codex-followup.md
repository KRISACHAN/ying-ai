# 代码审查复核 - V1.3 Stage 02 story workflow + postgres

- 日期：2026-07-20
- 审查工具：Codex
- 模型：GPT-5
- 复核对象：`.code-reviews/v1.3/1-0aeda3a/cursor-review.md`
- 对应提交：`0aeda3a feat(story): 实现剧情工作流持久化`
- 结论：通过

## 复核范围

本轮已根据复核结果修改实现代码、验证脚本与 README。

已复核和修改的主要文件：

- `.code-reviews/v1.3/1-0aeda3a/cursor-review.md`
- `packages/story-core/src/providers/keyword-lore-provider.ts`
- `packages/story-core/src/workflow/default-story-workflow.ts`
- `packages/story-core/src/abstractions/story-workflow.ts`
- `packages/story-core/src/abstractions/story-state-provider.ts`
- `packages/story-core/scripts/verify-story-workflow.ts`
- `packages/story-postgres/src/postgres-story-state-provider.ts`
- `packages/story-postgres/scripts/verify-story-postgres.ts`
- `packages/story-core/README.md`
- `packages/story-postgres/README.md`

## 总体判定

Cursor review 的 8 个问题中，大部分成立。本轮已处理 2 个 High、4 个 Medium，并将 2 个 Low 保留为非阻塞关注项。

- 复核问题数：8
- 已采纳并修复：6
- 不成立：0
- 保留关注：2
- 未处理：0
- code-reviewer 建议：CHANGES ADDRESSED
- 架构状态：ACCEPTABLE WITH LOW FOLLOW-UPS

## 已采纳并修复

### 1. `planner_only` secret lore 被提前过滤

- 原问题：Cursor review High #1
- 修复位置：`packages/story-core/src/providers/keyword-lore-provider.ts`、`packages/story-core/scripts/verify-story-workflow.ts`
- 判定：已采纳并修复

移除了未公开 secret 且无 `revealConditions` 时的前置过滤，让已召回 secret lore 统一进入 visibility 判定。新增 workflow 验证，断言未公开 secret lore 进入 Planner 时为 `planner_only`，且不会进入 Renderer。

### 2. `DefaultStoryWorkflow` 默认 in-memory 依赖可能与 Postgres state provider 分裂

- 原问题：Cursor review High #2
- 修复位置：`packages/story-core/src/workflow/default-story-workflow.ts`、`packages/story-core/scripts/verify-story-workflow.ts`、`packages/story-core/README.md`
- 判定：已采纳并修复

`DefaultStoryWorkflow` 现在只为 `InMemoryStoryStateProvider` 自动创建 in-memory Turn / Message / Committer。只要 Host 提供任何自定义 turn persistence 组件，就必须成组提供 `turnRepository`、`messageProvider` 与 `committer`；持久化 state provider 不再静默回退到 in-memory turn 存储。

### 3. idempotency replay state contract 不明确

- 原问题：Cursor review Medium #1
- 修复位置：`packages/story-core/src/abstractions/story-workflow.ts`、`packages/story-core/src/workflow/default-story-workflow.ts`、`packages/story-core/README.md`
- 判定：已采纳并修复

V1.3 Stage 02 不引入 turn 级 state snapshot 持久化。重复 `clientTurnId` replay 时仍返回当前最新 state，但新增 `stateSnapshotStatus: "current_latest"` 明确该 state 不是原 turn 快照；正常新提交返回 `stateSnapshotStatus: "turn_snapshot"`。

### 4. `saveState` 缺少 revision CAS，公开方法可绕过并发保护

- 原问题：Cursor review Medium #2
- 修复位置：`packages/story-core/src/abstractions/story-state-provider.ts`、`packages/story-core/src/providers/in-memory-story-state-provider.ts`、`packages/story-core/src/providers/in-memory-story-turn-committer.ts`、`packages/story-postgres/src/postgres-story-state-provider.ts`、`packages/story-postgres/README.md`
- 判定：已采纳并修复

`StoryStateProvider.saveState` 新增可选 `expectedRevision`。in-memory 与 Postgres provider 都会在提供 expected revision 时执行 CAS 检查；in-memory committer 也改为带 expected revision 调用。

### 5. README 声称的 CAS 覆盖与 verify 脚本不匹配

- 原问题：Cursor review Medium #3
- 修复位置：`packages/story-postgres/scripts/verify-story-postgres.ts`、`packages/story-postgres/README.md`
- 判定：已采纳并修复

Postgres 验证新增 stale revision conflict 用例，并新增 failed turn 同 `clientTurnId` 重试为 committed 的用例。README 同步说明 verification 覆盖 failed retry 与 revision CAS。

### 6. 自动 lore reveal 注入发生在 plan 之后

- 原问题：Cursor review Medium #4
- 修复位置：`packages/story-core/src/workflow/default-story-workflow.ts`、`packages/story-core/scripts/verify-story-workflow.ts`、`packages/story-core/README.md`
- 判定：已采纳并修复

自动 `add_revealed_lore` 现在在 lore recall 后、context-ready 与 Planner 前计算并预校验。Planner 接收的 state 已包含本回合自动揭示的 lore id，最终提交仍走统一 candidate changes 校验与 committer 原子提交。

## 不成立

无。

## 保留关注

### 1. 未知 `loreId` 在 renderer lore 组装中被静默跳过

- 原问题：Cursor review Low #7
- 位置：`packages/story-core/src/workflow/default-story-workflow.ts`
- 判定：成立，但可作为后续清理项保留

当前 validator 已覆盖 planner reveal 的未知 `loreId`，因此主要提交路径不会静默通过。后续仍可把 `getRendererLore` 的兜底行为改成结构化诊断。

### 2. Summary 每回合更新，缺少 Host 频率配置

- 原问题：Cursor review Low #8
- 位置：`packages/story-core/src/workflow/default-story-workflow.ts`
- 判定：成立，但属于非阻塞关注项

Stage 02 对 Summary 更新频率使用“建议”语气；当前每个 committed turn 后更新，行为可用但不够经济。建议后续补 Host 可配置的更新策略或节流策略。

## 未处理

无。

## 验证记录

- `pnpm --filter @ying-companion/story-core typecheck`：通过
- `pnpm --filter @ying-companion/story-postgres typecheck`：通过
- `pnpm --filter @ying-companion/story-core verify:story-contract`：通过
- `pnpm --filter @ying-companion/story-core verify:story-workflow`：通过
- `pnpm --filter @ying-companion/story-postgres verify:story-postgres`：通过
- `pnpm --filter @ying-companion/story-postgres verify:story-recovery`：通过
- `pnpm --filter @ying-companion/story-core build`：通过
- `pnpm --filter @ying-companion/story-postgres build`：通过
- `pnpm --filter @ying-companion/story-core lint`：通过
- `pnpm --filter @ying-companion/story-postgres lint`：通过

备注：Postgres 验证首次在沙箱内因本地 `5432` 连接 `EPERM` 失败；已按权限流程提升后重跑并通过。

## 后续建议

1. 低优先级处理 unknown lore 诊断。
2. 低优先级处理 Summary 频率配置。

## 最终结论

当前 Cursor review 中无 finding 被判定为不成立。High / Medium finding 已按 V1.3 范围处理并验证通过，剩余为 Low follow-up。
