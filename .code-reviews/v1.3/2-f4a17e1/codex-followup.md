# 代码审查复核 - V1.3 Stage 03 Story Workbench

**日期：** 2026-07-23  
**审查工具：** Codex  
**审查范围：** `.code-reviews/v1.3/2-f4a17e1/cursor-review.md` 及当前实现  
**引用：** `.code-reviews/v1.3/2-f4a17e1/cursor-review.md`  
**对应提交：** `f4a17e10a1d2da60048d65b5c9de357517de0f93`  
**结论：** 建议

## 依据规范

- `AGENTS.md`
- `docs/ai/core/principles.md`
- `docs/ai/core/working-agreements.md`
- `docs/ai/core/verification.md`
- `.requirements/stages/v1.3/stage-03/03-story-workbench-and-release-closure.md`
- `apps/model-runtime-demo/README.md`
- `packages/story-core/README.md`
- `.codex/skills/code-review-followup/SKILL.md`

## 摘要

Cursor review 的 6 项 finding 中，失败状态被详情刷新覆盖、Planner 绕过 Lore 召回门控、Accepted Changes 缺少具体变更三项成立，现已修复并补充定向契约验证。属性键双实现、Demo Debug Wire 暴露 `planner_only` Lore、JSON 导入仅预览三项保留为当前阶段的非阻塞关注。仓库级 typecheck、lint、build 与 Story 定向验证均通过，当前无未处理的 High / Medium 缺陷。

## 审查统计

- 复核问题数：6
- 已采纳并修复：3
- 不成立：0
- 保留关注：3
- 未处理：0
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

#### 1. 失败回合状态被 `refreshDetail()` 覆盖为 `success`

- 原问题：Cursor review High #1
- 修复位置：`apps/model-runtime-demo/app/story-runtime-workspace.tsx`、`apps/model-runtime-demo/app/lib/story-stream-ui-adapter.ts`、`apps/model-runtime-demo/app/lib/story-stream-transport.ts`
- 判定：已采纳并修复

Workspace 现在从 UI Adapter 读取最终回合状态。只有正常收到 `story:finish` 并进入 `success` 才会用持久化消息替换本地消息并设置成功；`failed` / `validation_failed` 回合仍刷新 state、turns 与 summary，但保留错误状态和本轮用户输入，空 assistant 占位会被移除。NDJSON parser 同时拒绝没有 `finish/error` 终态的流，避免非终态被误判成功。

#### 2. ModelStoryPlanner 读取完整 Story Definition，绕过 Lore 门控

- 原问题：Cursor review High #2
- 修复位置：`packages/story-core/src/planner/model-story-planner.ts`、`apps/model-runtime-demo/scripts/verify-story-workbench-planner.ts`
- 判定：已采纳并修复

Planner 改为接收显式公开投影：保留故事基础信息、玩家角色、公开角色字段、场景、item/clue/event 目录、属性和叙事规则；不再序列化完整 `lore`、角色 `privateBackground` 或 `secrets`。Lore 只能通过 `recalledLore` 进入模型。新增验证同时断言未召回 secret 不在 Definition 投影中，而已召回的 `planner_only` Lore 仍能进入 Planner。

#### 3. `story:state-prepared` 无法支撑 Accepted Changes 面板

- 原问题：Cursor review Medium #3
- 修复位置：`packages/story-core/src/abstractions/story-event.ts`、`packages/story-core/src/workflow/default-story-workflow.ts`、`apps/model-runtime-demo/app/story-runtime-workspace.tsx`
- 判定：已采纳并修复

`StoryStatePreparedEvent` 新增 `appliedChanges: StoryStateChange[]`，Workflow 使用 validator 最终返回的 `validation.changes` 填充。Wire 显式验证该字段可安全序列化，Debug 面板把 `appliedChanges` 显示为 accepted，并单独保留 prepared revision 元数据。

### 不成立

无。

### 保留关注

#### 1. Demo 侧重复实现 `createStoryAttributeStorageKey`

- 原问题：Cursor review Medium #1
- 位置：`apps/model-runtime-demo/app/lib/story-attribute-key.ts`
- 判定：成立，但当前不直接改为从 story-core 根入口做客户端运行时导入

`story-runtime-workspace.tsx` 是 Client Component，而 `@ying-companion/story-core` 当前只暴露 CommonJS 根运行时入口。此前客户端根导入已触发 Next.js/Webpack `import.meta` 解析错误；本轮生产构建也证明保留本地 helper 的边界可用。后续应先提供独立、客户端安全的子路径导出，例如 `@ying-companion/story-core/attribute-key`，再删除 Demo 副本并增加一致性测试。

#### 2. Demo Debug Wire 传递 `planner_only` Lore 全文

- 原问题：Cursor review Medium #2
- 位置：`apps/model-runtime-demo/app/lib/story-stream-wire.ts`、`apps/model-runtime-demo/app/story-runtime-workspace.tsx`
- 判定：当前 Demo 范围内符合规格，未来产品宿主不得复用

Stage 03 明确要求 Debug 面板展示 Recalled Lore，并把 `story:lore-recalled` 旁路送入 Debug。当前 Wire 位于 `apps/model-runtime-demo`，其全文载荷用于开发者解释召回与 visibility 决策。`apps/model-runtime-demo/README.md` 已明确该协议是 debug-only；未来 `apps/web` 接入时必须建立产品侧映射并移除 `planner_only.content`。

#### 3. JSON 导入只校验与预览，不持久化开档

- 原问题：Cursor review Low #1
- 位置：`apps/model-runtime-demo/app/api/stories/import/route.ts`、`apps/model-runtime-demo/app/stories/story-actions.tsx`
- 判定：成立，但属于明确展示的非阻塞范围限制

Stage 03 将 `POST /api/stories/import` 标为可选 API，并明确不要求完整创作平台；当前 UI 也明确写明“仅预览导入”。若后续要求导入定义可立即创建 Session，需要补临时目录或持久化 catalog，并定义版本、重名和生命周期语义。

### 未处理

无。

## 验证

- `pnpm --filter @ying-companion/model-runtime-demo verify:story-ui-adapter`：通过
- `pnpm --filter @ying-companion/story-core verify:story-workflow`：通过
- `pnpm --filter @ying-companion/model-runtime-demo verify:story-stream-contract`：通过
- `pnpm --filter @ying-companion/model-runtime-demo verify:story-workbench-planner`：通过
- `pnpm typecheck`：通过，10/10 tasks successful
- `pnpm lint`：通过，10/10 tasks successful
- `pnpm build`：通过，10/10 tasks successful；Next.js 15.5.19 生产构建成功
- `git diff --check`：通过

## 合成说明

- code-reviewer：COMMENT
- 架构状态：WATCH
- 最终结论：**建议**。原 review 的两个 High 和一个有效 Medium 已修复并验证，剩余三项均为已记录的阶段边界或后续架构收敛项。
