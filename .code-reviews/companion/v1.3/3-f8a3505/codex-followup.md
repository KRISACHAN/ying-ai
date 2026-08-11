# 代码审查复核 — V1.3 Stage 03 Release Closure

**日期：** 2026-07-23  
**审查工具：** Codex  
**审查范围：** `.code-reviews/v1.3/3-f8a3505/cursor-review.md`、提交 `f8a3505` 及本轮修复  
**引用：** `.code-reviews/v1.3/3-f8a3505/cursor-review.md`  
**结论：** 建议

## 依据规范

- `AGENTS.md`
- `docs/ai/core/principles.md`
- `docs/ai/core/working-agreements.md`
- `docs/ai/core/verification.md`
- `.requirements/stages/v1.3/stage-03/03-story-workbench-and-release-closure.md`
- `.requirements/stages/v1.3/stage-03/03-story-workbench-and-release-closure-patch.md`
- `apps/model-runtime-demo/README.md`
- `packages/story-core/README.md`
- `packages/story-postgres/README.md`
- `.codex/skills/code-review-followup/SKILL.md`

## 摘要

Cursor review 的 3 个 finding 经核对后均成立，本轮已全部修复。幂等重放现在使用 canonical persisted Plan / Lore / Changes，同时保留本次 replay 的真实稀疏 Timeline；Session 卡片展示 snapshot story title；列表查询统一通过 `deserializeStoryDefinition()` 校验 snapshot。定向契约、typecheck、lint、生产构建和真实浏览器重放均通过，当前没有未处理的代码 finding。

## 审查统计

- 复核问题数：3
- 已采纳并修复：3
- 不成立：0
- 保留关注：0
- 未处理：0
- code-reviewer 建议：APPROVE
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

#### 1. 幂等重放保留 canonical Debug 产物

- 原问题：Cursor review Medium
- 修复位置：`apps/model-runtime-demo/app/story-runtime-workspace.tsx`、`apps/model-runtime-demo/app/lib/story-workbench-data.ts`、`apps/model-runtime-demo/scripts/verify-story-workbench-data.ts`
- 判定：**已采纳并修复**

新增 `resolveStoryDebugTurnSource()`，把“是否有实时 Timeline”和“turn 级调试产物使用哪个来源”拆开：

- 正常流式回合使用 live Context / Plan / Lore / Changes；
- 初始恢复和 `idempotentReplay` 使用 persisted canonical turn 产物；
- 只要本次存在 Wire Events，Timeline 仍展示真实事件，不伪造 replay 中不存在的 Plan / Lore lifecycle。

浏览器使用既有 `clientTurnId` 重放后，页面同时满足：显示“已提交回合重放”、Effective Context 标记 `source: "persisted"`、Planner 与 Lore 内容不为空、Timeline 只有 `start / session-loaded / state-loaded / committed / finish` 五个真实事件。

#### 2. Session 卡片展示 snapshot story title

- 原问题：Cursor review Low
- 修复位置：`apps/model-runtime-demo/app/stories/[storyId]/sessions/page.tsx`
- 判定：**已采纳并修复**

卡片 meta 现在显示 `session.storyTitle`、state revision 与 definition version；标题字段来自 `definitionSnapshot.title`，不再只存在于数据层。浏览器验收确认列表卡片同时展示 snapshot story title 与 snapshot current scene title。

#### 3. Session 列表统一反序列化 Definition snapshot

- 原问题：Cursor review Low
- 修复位置：`apps/model-runtime-demo/app/lib/story-debug-repository.ts`
- 判定：**已采纳并修复**

`StorySessionRow.definition_snapshot` 改为 `unknown`。`listSessions()` 在构造展示项前调用 `deserializeStoryDefinition()`，与 `PostgresStorySessionProvider.getSession()` 使用相同的深拷贝和 `validateStoryDefinition()` fail-fast 规则。查询仍是单次 JOIN，没有引入 N+1，也不会改写旧 snapshot。

### 不成立

无。

### 保留关注

无新增 finding。以下架构 WATCH 属于 V1.3 已声明边界，不是本轮代码缺陷：

- 进程内 Registry 重启后不保留导入 Definition；已有 Session 仍依赖深链按 snapshot 恢复。
- Demo 注册 helper 依赖 `InMemoryStoryProvider`；未来建设持久化 Catalog 时应抽可变注册端口。

### 未处理

无。

## React / Next.js 边界检查

- `resolveStoryDebugTurnSource()` 是纯同步派生函数，没有引入 Effect 或重复状态；符合 derived state 在 render 中计算的原则。
- Client Component 对 `story-workbench-data.ts` 的运行时导入不携带 Node/Postgres 依赖；该模块对 Story Core 仅使用 `import type`。
- `deserializeStoryDefinition()` 只在 Server Component 的 Repository 路径运行；客户端对 `story-debug-repository.ts` 仍为 type-only import。
- Next.js 15 `params: Promise<...>` 与 Server/Client props 的 JSON 可序列化边界保持不变。

## 验证

- `pnpm --filter @ying-companion/model-runtime-demo verify:story-workbench-data`：通过；新增 normal live、replay persisted、initial persisted 三种 source 决策断言。
- `pnpm --filter @ying-companion/model-runtime-demo verify:story-ui-adapter`：通过。
- `pnpm --filter @ying-companion/model-runtime-demo typecheck`：通过。
- `pnpm --filter @ying-companion/model-runtime-demo lint`：通过。
- `pnpm --filter @ying-companion/model-runtime-demo build`：通过；Next.js 15.5.19 生产构建成功。
- Playwright Session 列表验收：通过；卡片显示 `雾港疑云 · revision … · definition …`，旧 snapshot 场景继续显示“蓝月酒馆”。
- Playwright 同 `clientTurnId` 重放：通过；状态为 success 并显示重放徽章，Planner/Lore 保留，Timeline 为 5 个真实 replay events。
- Playwright 控制台：0 errors / 0 warnings。
- `git diff --check`：通过。

## 合成说明

- code-reviewer：APPROVE
- 架构状态：WATCH
- 最终结论：**建议**。Cursor 的 3 个 finding 已全部修复并验证；剩余 WATCH 仅为 V1.3 已记录的进程 Registry 生命周期和未来 Catalog 抽象边界。
