# 代码审查 — V1.3 Stage 03 Release Closure Patch（f8a3505）

**日期：** 2026-07-23  
**审查工具：** Cursor  
**模型：** Cursor Grok 4.5  
**审查范围：** HEAD 最新提交 `f8a3505`  
**引用：** `git show f8a350513fd8f6ba927b52dca0b3c4b583028599`（29 文件，+1128 / −85）  
**结论：** 建议

## 依据规范

- [AGENTS.md](../../../AGENTS.md)
- [docs/ai/core/principles.md](../../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../../docs/ai/core/project-context.md)
- [docs/ai/core/git-protocol.md](../../../docs/ai/core/git-protocol.md)
- [.cursor/rules/ai-guide.mdc](../../../.cursor/rules/ai-guide.mdc)
- [.requirements/stages/v1.3/stage-03/03-story-workbench-and-release-closure.md](../../../.requirements/stages/v1.3/stage-03/03-story-workbench-and-release-closure.md)
- [.requirements/stages/v1.3/stage-03/03-story-workbench-and-release-closure-patch.md](../../../.requirements/stages/v1.3/stage-03/03-story-workbench-and-release-closure-patch.md)
- [apps/model-runtime-demo/README.md](../../../apps/model-runtime-demo/README.md)
- [packages/story-core/README.md](../../../packages/story-core/README.md)
- [eslint.config.mjs](../../../eslint.config.mjs) · [prettier.config.mjs](../../../prettier.config.mjs)
- 前序审查：[.code-reviews/v1.3/2-f4a17e1/cursor-review.md](../2-f4a17e1/cursor-review.md)

## 摘要

本提交按 Stage 03 patch 收口：Core 幂等可观测字段、Wire/Route canonical assistant text、persisted Debug hydration、进程内 JSON Registry、Session 列表 snapshot 场景标题，以及文档 / verify 闭环。前序 High（失败态被刷成 success、Planner 透传完整 Definition）已在父提交 `8f2b324` 修复且本树仍成立。当前无阻塞缺陷；幂等重放时 Debug 面板因 `isLive` 启发式会清空 Plan/Lore/Accepted，属中优先级体验缺口。架构边界符合 V1.3，进程 Registry 与 Postgres Session 的可发现性债务记为 WATCH。

## 审查统计

- 审查文件数：29
- 问题总数：3（严重 0 / 高 0 / 中 1 / 低 2）
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`apps/model-runtime-demo/app/story-runtime-workspace.tsx:327-342`] [规范: stage-03-patch §3.1 / §3.2] **幂等重放的稀疏 Wire 流被当成完整 live turn，Debug 清空 Plan / Lore / Accepted**

  重放路径只发 `start → session/state-loaded → committed → finish`，无 `plan-completed` / `lore-recalled` / `state-prepared`。面板用 `isLive = wireEvents.length > 0` 后走 live 分支，Plan/Lore/Accepted 落成 `null` / `[]`，即使同轮 `refreshDetail` 已刷新 `persistedDebug`。

  **复现路径：** 同一 `clientTurnId` 重放 → 页面显示「已提交回合重放」与 canonical 文本 → Debug 的 Planner / Lore / Accepted 为空；刷新后才恢复 persisted。

  **当前影响：** 补丁要求「重复 clientTurnId … Wire / UI 中明确标记幂等重放」已满足，但「persisted 与 live 数据必须明确区分；发送新回合后 live 覆盖 persisted」在 replay 场景下误伤 latest-turn 调试信息。

  **修复建议：** 将 live 判定改为「存在 turn 级产物」或向 `StoryDebugPanel` 传入 `idempotentReplay`，replay 时对 plan/lore/changes 回退 `persistedDebug`，例如 `const useLivePlan = isLive && latestPlanPayload != null`。

### 低

- [`apps/model-runtime-demo/app/stories/[storyId]/sessions/page.tsx:57-66`] + [`story-workbench-data.ts:138`] **`storyTitle` 已从 snapshot 算出但列表未展示**

  补丁 §3.4 要求列表展示 story title / definition version / current scene title；UI 已显示 scene title 与 definition version，`storyTitle` 仅存在于数据层。种子页顶栏已有当前故事标题时影响较小；导入后同 id 不同标题更易暴露缺口。

  **修复建议：** 在卡片 meta 或副标题展示 `session.storyTitle`。

- [`apps/model-runtime-demo/app/lib/story-debug-repository.ts:88`] **`listSessions` 直接使用 `definition_snapshot` jsonb，未走 `deserializeStoryDefinition`**

  Session Provider 路径会反序列化并校验；列表查询旁路校验。当前 jsonb 形状与内存 Definition 一致时场景标题正确，但损坏 snapshot 会在列表静默降级为 sceneId，而不是显式失败。

  **修复建议：** 复用 `deserializeStoryDefinition`（或 sessionProvider 列表 API），与 Runtime 恢复路径一致。

## 架构关注项

- [`packages/story-core/src/workflow/default-story-workflow.ts:201-223`] **CLEAR** — Core 在 `getCommittedByClientTurnId` 短路处设置 `idempotentReplay` + `assistantText`，比 Wire 用事件稀疏度猜测更可靠；符合 patch §3.2，也不破坏 Core/Wire 分层。
- [`apps/model-runtime-demo/app/lib/story-workbench-data.ts:53-66`] + [`sessions/page.tsx:16-22`] **WATCH** — 进程内 Registry 与 Postgres Session 生命周期分叉：重启后导入故事从 `/stories` 消失，`/stories/[id]/sessions` 因 `getStory` 404，但深链 Runtime 仍可按 `definitionSnapshot` 恢复。属 Stage 03 明确非目标（无 Definition DB），需在 README/操作路径上保持诚实。
- [`apps/model-runtime-demo/app/lib/story-workbench-data.ts:53`] **WATCH** — `registerRuntimeStoryDefinition` 依赖具体 `InMemoryStoryProvider.registerDefinition`；Demo 可接受，后续 Catalog 应抽可变注册端口，避免宿主绑死 in-memory 实现。
- [`apps/model-runtime-demo/app/lib/story-workbench-data.ts:95-120`] **CLEAR** — persisted timeline 仅重建可证明的 `story:committed`，未伪造完整 live event 时间轴。

## 前序问题对照（2-f4a17e1）

| 原问题                                              | 本树状态                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 失败后 `refreshDetail` 强制 `success`               | **已修复**（`8f2b324`）：`preserveTurnOutcome` 于 `story-runtime-workspace.tsx:129-140,169-179` |
| ModelStoryPlanner 透传完整 Definition / secret lore | **已修复**（`8f2b324`）：`createPlannerStoryContext` 省略 lore / privateBackground / secrets    |
| JSON 导入仅预览不可开档                             | **本提交已关闭**：进程 Registry + 可创建 Session                                                |

## Patch 验收对照

| 准则                                                    | 结论                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 幂等重放返回 canonical text、不二次推进、Wire/UI 可观测 | **通过**（Core / messages route / UI Adapter / UI 徽章；`verify:story-workflow` / stream / ui-adapter） |
| persisted Debug hydration；不伪造 live 时间             | **通过**（`source: "persisted"`；timeline 用 `committedAt`）                                            |
| JSON import 进程注册 + 冲突 409                         | **通过**（`register` / `unchanged` / `StoryDefinitionConflictError`）                                   |
| Session 列表场景标题来自 snapshot                       | **通过**（SQL 取 `definition_snapshot`；UI 用 `currentSceneTitle`）                                     |
| 文档收口                                                | **通过**（AGENTS / README / requirements / package README / project-context）                           |

## 合成说明

- code-reviewer：COMMENT（无 High/Critical；1 个 Medium）
- 架构状态：WATCH（进程 Registry 可发现性债务，非 Stage 03 blocker）
- 最终结论：**建议**（依据 OMX 合成规则：architect = WATCH → 建议；reviewer = COMMENT → 建议）

## 检查项

### 安全

- [x] 无硬编码密钥；import 先 `validateStoryDefinition`；冲突不静默覆盖
- [ ] Demo Debug 仍透传 recalled lore（含 planner_only）到同页 — 前序 WATCH，本提交未扩大范围

### 代码质量

- [x] 纯数据逻辑抽到 `story-workbench-data.ts`，便于离线 verify
- [x] Core 幂等字段向后兼容（新提交显式 `idempotentReplay: false`）
- [ ] replay Debug live 启发式需收紧（见中优先级）

### 性能

- [x] `listSessions` 一次 JOIN 取 snapshot，无 N+1 二次查 Definition

### 项目规范

- [x] docs/ai/core 边界：Core 不读 env；Wire 映射在 Demo
- [x] Stage 03 patch 范围未膨胀到 Definition DB / Companion 合并
- [x] 新增 `verify:story-workbench-data` 并挂 package.json

### 架构

- [x] Core Event 增量字段有充分理由
- [x] WATCH：Registry ↔ Session 可发现性；InMemory 耦合

### 验证

已执行并全部通过：

```bash
pnpm --filter @ying-companion/model-runtime-demo verify:story-workbench-data
pnpm --filter @ying-companion/model-runtime-demo verify:story-stream-contract
pnpm --filter @ying-companion/model-runtime-demo verify:story-ui-adapter
pnpm --filter @ying-companion/story-core verify:story-workflow
```

未在本审查中重跑全仓 `typecheck` / `lint` / `build` 与浏览器手工路径 A–H。

## 备注

- 双车道均可用：[code-reviewer](a8bf5757-a85d-4857-b05d-17b6d2a85ba7) · [architect](81d330cd-e1d7-4447-b972-1aafc6b4db16)
- 建议合入前优先修 Medium（replay Debug 回退 persisted）；Low 与 WATCH 可记入后续 polish / Definition Catalog
- 浏览器最小验收仍建议手跑 patch §七 F（同 clientTurnId 重放）并确认 Debug 在修完后不再被清空
