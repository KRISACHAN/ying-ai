# @ying-companion/story-core

`@ying-companion/story-core` 是 V1.3 Story Mode 的独立故事域 SDK。它复用 `@ying-companion/ai-core` 的通用模型与 Safety 抽象，但不修改 Companion Chat 主链路，也不依赖数据库、环境变量或 Demo UI。

## 边界

- Core 包不读取 `process.env`。
- Story State 不写入 Companion Memory。
- Planner 只输出结构化 `StoryTurnPlan`，Renderer 只渲染文本。
- 状态只能通过 `StateTransitionValidator` 校验后的 `StoryStateChange` 原子提交。
- 动态字段必须先在 `StoryDefinition.attributes` 中声明，再写入 `StoryState.attrs`。

## Workflow

`DefaultStoryWorkflow.execute()` 与 `stream()` 共用同一套步骤：

```txt
guardInput
→ load StorySession.definitionSnapshot
→ load StoryState
→ check clientTurnId committed idempotency
→ load Summary + recent messages
→ recall Lore
→ inject automatic add_revealed_lore candidates
→ story:context-ready
→ Planner.plan
→ validate candidate changes
→ apply changes in memory
→ Renderer.render / Renderer.stream
→ guardOutput
→ StoryTurnCommitter.commitSuccessfulTurn
→ update Summary
```

成功路径不再调用 `StoryStateProvider.saveState()`；状态、Turn、Messages 只能通过 `StoryTurnCommitter` 一次提交。所有 successful committed turn 都推进 `StoryState.revision + 1`，包括无 `stateChanges` 的戏内拒绝。是否真的改了世界业务状态用 `stateChanged` 区分，不用 revision 推断。

`DefaultStoryWorkflow` 只会为 `InMemoryStoryStateProvider` 自动创建 in-memory Turn / Message / Committer。Host 注入持久化 state provider 时，必须同时注入 `turnRepository`、`messageProvider` 与 `committer`，避免 State 与 Turn/Message 分别落到不同存储。

重复 `clientTurnId` 命中已 committed turn 时不会再次推进 revision，也不会再次调用 Planner / Renderer。V1.3 Stage 02 不持久化 turn 级 state snapshot，因此 replay 结果的 `previousState` / `nextState` 是当前最新 state，并通过 `stateSnapshotStatus: "current_latest"` 标记；正常新提交为 `stateSnapshotStatus: "turn_snapshot"`。

## Events

Story Core Event 属于本包，不塞进 Companion stream event：

```txt
story:start
story:session-loaded
story:state-loaded
story:summary-loaded
story:lore-recalled
story:context-ready
story:plan-started
story:plan-completed
story:validation-failed
story:state-prepared
story:render-started
story:text-delta
story:render-completed
story:committed
story:summary-updated
story:finish
story:error
```

事件保留 Core 语义：`Date`、富对象和错误对象允许存在。Stage 03 的 Demo Wire 层再做网络安全映射。`story:state-prepared` 只代表内存候选状态，只有 `story:committed` 后世界才算推进。

## Lore

`KeywordLoreProvider` 支持：

- `always`
- `keyword`
- `state`
- `keyword_and_state`
- scene / character 过滤
- priority 排序
- 简单 budget 截断
- secret lore 可见性

召回结果使用 `RecalledLoreEntry`，区分 `planner_only` 与 `planner_and_renderer`。Renderer 只接收 `planner_and_renderer`。`StoryState.revealedLoreIds` 是固定 Core State 字段，必须通过 `add_revealed_lore` 变更校验后持久化；不能用 `attrs` 伪造。

## Summary

Narrative Summary 是早期剧情压缩记忆，不替代 `StoryState` 或 `StoryDefinition`。Summary 更新发生在 Turn 成功提交后；Summary 失败不会回滚已提交 Turn，下回合继续使用旧 Summary 与 recent messages。

## 验证

```bash
pnpm --filter @ying-companion/story-core typecheck
pnpm --filter @ying-companion/story-core build
pnpm --filter @ying-companion/story-core lint
pnpm --filter @ying-companion/story-core verify:story-contract
pnpm --filter @ying-companion/story-core verify:story-workflow
```

`verify:story-workflow` 完全离线，覆盖事件顺序、text delta、clientTurnId 幂等、失败不污染状态、Summary 失败不回滚、secret lore 可见性与 revision 语义。
