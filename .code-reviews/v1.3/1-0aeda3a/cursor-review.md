# 代码审查 — V1.3 Stage 02 story workflow + postgres（0aeda3a）

**日期：** 2026-07-20  
**审查工具：** Cursor  
**模型：** Composer  
**审查范围：** HEAD 最新提交 `0aeda3a`  
**引用：** `git show 0aeda3a125c6c319877e9ff80a4480fdcdaaa270`（56 文件，+3311 / −134）  
**结论：** 需修改

## 依据规范

- [AGENTS.md](../../../AGENTS.md)
- [docs/ai/core/principles.md](../../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../../docs/ai/core/project-context.md)
- [docs/ai/core/git-protocol.md](../../../docs/ai/core/git-protocol.md)
- [.cursor/rules/ai-guide.mdc](../../../.cursor/rules/ai-guide.mdc)
- [.requirements/stages/v1.3/stage-02/02-narrative-workflow-lore-and-persistence.md](../../../.requirements/stages/v1.3/stage-02/02-narrative-workflow-lore-and-persistence.md)
- [packages/story-core/README.md](../../../packages/story-core/README.md)
- [packages/story-postgres/README.md](../../../packages/story-postgres/README.md)
- [eslint.config.mjs](../../../eslint.config.mjs) · [prettier.config.mjs](../../../prettier.config.mjs)

## 摘要

`0aeda3a` 完成 Stage 02 主体：`DefaultStoryWorkflow` 的 execute/stream 共享路径、`StoryTurnCommitter` 原子提交、Core Event（含 `story:context-ready`）、Lore 多激活模式、`revealedLoreIds` / `add_revealed_lore`，以及新建 `packages/story-postgres`（migration、幂等、snapshot 冻结、recovery 脚本）。离线 `verify:story-workflow` / `verify:story-contract` 与 `story-postgres` typecheck 已通过。主要缺口是 **无 `revealConditions` 的 secret Lore 被完全过滤（违反 `planner_only`）**、Workflow 默认 InMemory 与 Postgres 部分注入易 split-brain，以及 revision CAS / failed retry 等门禁测试证据不足。架构主路径正确，但规范级语义偏差需改后再合。

## 审查统计

- 审查文件数：约 42（重点细读 workflow / lore / committer / migration / verify 脚本）
- 问题总数：8（严重 0 / 高 2 / 中 4 / 低 2）
- code-reviewer 建议：REQUEST CHANGES
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

- [`packages/story-core/src/providers/keyword-lore-provider.ts:29-31`] [规范: stage-02 §6.5] **无 `revealConditions` 的 secret 被完全过滤，未实现 `planner_only`**

  Stage 02 要求未揭示 secret 可对 Planner 可见（`planner_only`），对 Renderer 不可见。当前在 activation 前直接 `continue`，Planner 也拿不到。

  **复现：** 雾港 `hidden-smuggler-route`（`secret: true`、`activation: always`、无 `revealConditions`）永远不进入 recall。`testSecretLoreVisibility` 只断言 Renderer 未收到，未覆盖 Planner 侧。

  **当前影响：** Model Planner 无法基于幕后 Lore 做揭示决策；与 README「区分 planner_only / planner_and_renderer」表述不一致。

  **修复建议：** 删除 early filter；沿用同文件 52–55 行 visibility 分支（`secret && !isRevealed && !revealConditionsMet` → `planner_only`）。补测：Planner 收到 `planner_only`，Renderer 仍排除。

- [`packages/story-core/src/workflow/default-story-workflow.ts:78-88`] **构造函数默认注入 InMemory turn/message/committer，Postgres 部分注入易 split-brain**

  Host 若只注入 `PostgresStoryStateProvider` / Session 而漏掉 committer / turnRepository / messageProvider：幂等查 turn 走内存；committer 可能经 `saveState` 写 PG，Turn/Message 仍在内存。

  **修复建议：** 生产路径要求显式注入三件套；或检测到非 InMemory `stateProvider` 时 constructor 抛错；README 增加 Host checklist。

### 中

- [`packages/story-core/src/workflow/default-story-workflow.ts:177-202`] **幂等路径 `previousState` / `nextState` 均为当前最新 state**

  重复 `clientTurnId` 时两者都返回 post-commit `currentState`，无法还原提交前快照（`CommittedStoryTurn` 仅有 revision 数字）。

  **修复建议：** Turn 持久化 previous/next state 快照；或文档明确幂等路径不保证历史 state，Host 应以 turn 记录与 `getState` 为准。

- [`packages/story-postgres/src/postgres-story-state-provider.ts:40-47`] **`saveState` 无 revision CAS**

  成功路径走 Committer 的 CAS UPDATE，但公开 `saveState` 为盲 UPDATE。InMemory Committer 仍调用 `stateProvider.saveState`。接口保留构成旁路覆盖风险。

  **修复建议：** 增加 `expectedRevision` 并校验 `rowCount`；或标注 deprecated / 文档禁止成功路径外直调。

- [`packages/story-postgres/scripts/verify-story-postgres.ts` / README:63] [规范: stage-02 §13.2 / §16] **门禁测试缺口与 README 表述超前**

  Committer 实现了 revision CAS，但集成脚本未断言 `STORY_STATE_CONFLICT`；未覆盖事务中途失败回滚、failed→committed 重试、AbortSignal 中断。README 称覆盖 revision CAS，与脚本不符。

  **修复建议：** 补并发/冲突用例；或收窄 README。补 AbortSignal 中断不推进 revision 的 offline 测试。

- [`packages/story-core/src/workflow/default-story-workflow.ts:230-248`] [规范: stage-02 §4.2 step 7b] **自动 `add_revealed_lore` 注入在 plan 之后**

  规格要求 recall 后、plan 前注入；实现放在 `plan-completed` 之后。对「条件已满足的揭示」持久化仍有效，但 Planner 看不到本回合将写入的 reveal candidate。

  **修复建议：** 将 `getAutomaticRevealChanges` 前移到 `planTurn` 之前（至少在 `story:context-ready` 前完成预计算），与 §4.2 对齐。

### 低

- [`packages/story-core/src/workflow/default-story-workflow.ts:612-615`] **`getRendererLore` 对未知 loreId 静默跳过**

  有 Validator 拦截非法 `add_revealed_lore` 作缓解。可改为校验失败或 debug assert。

- [`packages/story-core/src/workflow/default-story-workflow.ts:323-330`] **Summary 每回合必更新，无 Host 频率配置**

  §7.3 为建议项，非硬门禁。可后续加 `summaryUpdateEveryNTurns`。

## 架构关注项

- [`packages/story-core/src/providers/keyword-lore-provider.ts:29-31`] **WATCH** — `planner_only` 语义缺失是最强反对「原样批准」的理由；属 Stage 02 核心叙事契约，不是 polish。
- [`packages/story-core/src/workflow/default-story-workflow.ts:78-88`] **WATCH** — Provider 装配默认值削弱「Committer 单写者」边界。
- [`packages/story-postgres/src/postgres-story-state-provider.ts:40-47`] **WATCH** — `saveState` 旁路与 Committer CAS 假设冲突。
- 主路径（execute/stream 共享、Committer 在 render+safety 后、无 processing 预写、`story:context-ready`、Definition Snapshot 冻结）**CLEAR**，无阻塞级边界错误。

## 合成说明

- code-reviewer：REQUEST CHANGES
- 架构状态：WATCH
- 最终结论：**需修改**（依据 OMX 合成规则：REQUEST CHANGES → 需修改）

## 检查项

### 安全

- [x] 无硬编码密钥；Postgres SQL 均参数化
- [x] jsonb 经 schemaVersion / Definition 校验后反序列化
- [ ] secret Lore：Renderer 侧保守；Planner 侧欠供（见高优先级 #1）

### 代码质量

- [x] execute/stream 共享 `run()`；错误码 `StoryWorkflowError` 较完整
- [ ] 构造函数默认 InMemory 与 Host 装配复杂度偏高

### 性能

- [x] 无 N+1 类明显问题；单回合事务合理

### 项目规范

- [x] Core 不读 env；story-postgres 由 Host 注入 pool
- [x] 不进入 `SimpleChatWorkflow`；Story Event 独立
- [ ] Lore `planner_only` 与 Stage 02 §6.5 不一致

### 架构

- [x] `StoryTurnCommitter` 原子提交边界正确
- [ ] 装配默认值与 `saveState` 旁路为 WATCH

### 验证

- [x] `pnpm --filter @ying-companion/story-core typecheck` 通过
- [x] `pnpm --filter @ying-companion/story-core verify:story-workflow` 通过（11 ok）
- [x] `pnpm --filter @ying-companion/story-core verify:story-contract` 通过
- [x] `pnpm --filter @ying-companion/story-postgres typecheck` 通过
- [ ] 本机未重跑 `verify:story-postgres` / `verify:story-recovery`（需 `DATABASE_URL`）；以脚本与 README 对照审查

## 备注

**合并前最小修复集：**

1. 修复 `KeywordLoreProvider` secret 过滤 + 补 `planner_only` 测试
2. Workflow 对非 InMemory state 强制显式注入 committer/turn/message，或 constructor 守卫
3. 补 revision conflict 测试（或收窄 README）；建议补 AbortSignal 中断用例
4. 幂等返回的 `previousState` 语义修复或文档声明

若团队刻意将「无 revealConditions 的 secret 完全不可见」定为 V1.3 简化，须同步改 Stage 02 规格与 README，再降级高优先级 #1。

独立双车道均已执行（code-reviewer + architect）。
