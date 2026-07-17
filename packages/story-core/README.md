# @ying-companion/story-core

`@ying-companion/story-core` 是 V1.3 Story Mode 的独立故事域 SDK。它复用 `@ying-companion/ai-core` 的通用模型与 Safety 抽象，但不修改 Companion Chat 主链路，也不依赖数据库、环境变量或 Demo UI。

## 边界

- Core 包不读取 `process.env`。
- Story State 不写入 Companion Memory。
- Planner 只输出结构化 `StoryTurnPlan`，Renderer 只渲染文本。
- 状态只能通过 `StateTransitionValidator` 校验后的 `StoryStateChange` 原子提交。
- 动态字段必须先在 `StoryDefinition.attributes` 中声明，再写入 `StoryState.attrs`。

## 最小运行链路

```txt
StorySessionProvider.getSession
→ StoryStateProvider.getState
→ LoreProvider.recall
→ StoryPlanner.plan
→ StateTransitionValidator.validate
→ applyStoryStateChanges
→ StoryRenderer.render
→ Safety.guardOutput
→ StoryStateProvider.saveState
```

`DefaultStoryWorkflow.execute()` 在 Planner、Validator、Renderer 或 Safety 任一失败时都不会保存 `nextState`。

## 内置实现

- `InMemoryStoryProvider`
- `InMemoryStorySessionProvider`
- `InMemoryStoryStateProvider`
- `KeywordLoreProvider`
- `DefaultStoryTransitionValidator`
- `FakeStoryPlanner` / `FakeStoryRenderer`
- `ModelStoryPlanner` / `ModelStoryRenderer`

本包不内置、不导出任何具体 `StoryDefinition`。故事定义应由宿主、Demo、数据库、文件导入器或测试夹具从外部注入；`story-core` 只负责定义契约、校验状态变更并执行工作流。

## 验证

```bash
pnpm --filter @ying-companion/story-core typecheck
pnpm --filter @ying-companion/story-core build
pnpm --filter @ying-companion/story-core lint
pnpm --filter @ying-companion/story-core verify:story-contract
```

`verify:story-contract` 完全离线，使用脚本私有 fixtures、Fake Planner / Fake Renderer 覆盖 V1.3 stage 01 的状态契约；这些 fixtures 不属于公共 SDK API。
