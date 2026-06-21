# Cursor Review Follow-up — c43b3ef

**Date:** 2026-06-17
**Review Tool:** Codex
**Review Scope:** `.code-reviews/6-c43b3ef/cursor-review.md` and current implementation
**Reference:** `.code-reviews/6-c43b3ef/cursor-review.md`
**Verdict:** Advisory

## Summary

本轮先对 Cursor review 做响应记录，随后已按本文优先级修复 blocker 与文档缺口。不回复 GitHub、不 resolve review thread。

Cursor 的结论整体成立：滚动摘要的主体实现符合 patch-1 方向，原高优先级问题会影响核心验收场景，已在后续修复中处理。仍保留 workflow 体量与 `messageRange` 等非阻塞关注项。

## Follow-Up Conclusions

### Accepted and Fixed

1. **高优先级：Prompt 回复规则与 summary 注入冲突**

   结论：认可，已修。

   `buildPersonaSystemPrompt()` 已改为按 `summaryContext` / `memoryContext` 三分支输出规则：

   ```txt
   summary + memory：自然参考会话摘要与长期上下文
   summary only：自然参考会话摘要
   memory only：自然参考长期上下文
   none：仅依据本轮输入与短期历史
   ```

   这消除了 summary-only 场景下“已注入摘要但规则否定摘要”的冲突。

2. **中优先级：`recentMessageLimit >= messages.length` 的触发状态不清晰**

   结论：认可，已修。

   `splitForSummary()` 已在没有可压缩消息时返回 `triggered: false`，避免出现“触发但无压缩”的内部状态。Demo API 也补充了组合校验，要求：

   ```txt
   recentMessageLimit < summarizeTriggerMessageCount
   ```

3. **中优先级：Demo README 未同步滚动摘要说明**

   结论：认可，已修。

   `apps/model-runtime-demo/README.md` 已补充滚动摘要控件、默认关闭、`InMemorySummaryProvider` 进程内边界、阈值约束，以及 Prompt / Context Debug Panel 的 summary 调试字段。

4. **低优先级：workflow 文件头注释未提及 Summary**

   结论：认可，已修。

   `SimpleChatWorkflow` 文件头注释已同步 Summary load/update/save 编排。

### Retained Concern

1. **中优先级：`SimpleChatWorkflow` 文件体量继续增大**

   结论：认可，建议延后到修完 blocker 后处理。

   Summary helper 目前和 memory helper 同处 `simple-chat-workflow.ts`，短期可读，但 stage 5/6/7 继续加入 Emotion、Tool、Workflow 编排时会变得难维护。

   建议后续拆分：

   ```txt
   implementations/summary/workflow-summary.ts
     loadSummaryForWorkflow
     updateAndSaveSummaryForWorkflow
   ```

   `SimpleChatWorkflow` 保留主编排顺序即可。

### Unaddressed

以下问题本轮不处理，仅记录后续建议。

1. **`messageRange` 未填充**

   结论：低优先级，暂不阻塞。

   当前 `ConversationSummary.messageRange` 是预留字段，`ChatMessage` 本身没有稳定 id，workflow 也没有把 `messageIds` 映射到 summary update 输入。因此 Demo 里可能长期为空。

   建议后续如果确实要展示 range，再把 message id 传入 `SummaryUpdateInput`，不要在 updater 内凭空生成。

2. **Demo 使用模块级 `InMemorySummaryProvider` 单例**

   结论：Demo 可接受，README 已写清楚。

   这是进程内调试实现，不保证多 worker、热重载、跨重启一致性，也不是生产持久化方案。

3. **`packages/ai-core/src/index.ts` 导出 summary 实现类**

   结论：暂不作为问题处理。

   该做法与现有 memory provider / extractor 的导出风格一致。若后续要收紧公共 API，应作为独立 API 设计任务处理，不建议在本 patch 中单独改 summary。

### Not Valid

无。Cursor review 中没有明显误报。

## Suggested Reply To Cursor

```text
认可本轮 review 结论。高优先级问题成立：原 Prompt 在有 Conversation Summary 但无长期记忆召回时，规则 5 仍限制模型只能依据本轮输入与短期历史，和 summary 注入目标冲突，会影响 patch-1 §15.2 的核心验收场景。

已修复 Prompt 规则分支，使 summaryContext / memoryContext 存在时允许模型自然参考对应上下文，同时不暴露内部系统。也已补充 Demo README，说明 summaryOptions、InMemorySummaryProvider 的进程内边界，以及 Prompt Debug Panel 的 summaryContext / recentHistory / summarizedMessages 字段。

`recentMessageLimit` 的触发状态与 workflow 文件注释已处理。workflow 体量拆分和 messageRange 填充作为后续收尾项处理；其中 workflow 拆分建议放在 stage 7 前做，避免当前 patch 扩散。
```

## Proposed Fix Order

1. 已修 `buildPersonaSystemPrompt()` 规则 5，让 summary-only 场景不被短期历史规则否定。
2. 已补 `apps/model-runtime-demo/README.md`，记录滚动摘要开关、阈值和调试面板字段。
3. 已处理 `recentMessageLimit < summarizeTriggerMessageCount` 的校验与 `splitForSummary()` 空压缩状态。
4. 已同步 workflow 文件头注释。
5. 视后续 stage 7 复杂度，拆分 summary workflow helper。
6. 如确有调试价值，再设计 `messageRange` 的 message id 输入。

## Verification Needed After Fix

修复代码后建议至少验证：

```txt
pnpm --filter @ying-companion/ai-core typecheck
pnpm --filter @ying-companion/ai-core lint
pnpm --filter @ying-companion/model-runtime-demo typecheck
pnpm --filter @ying-companion/model-runtime-demo lint
pnpm --filter @ying-companion/model-runtime-demo build
```

手工场景：

```txt
1. 启用滚动摘要
2. recentMessageLimit=4
3. summarizeTriggerMessageCount=6
4. 连续输入阶段进度直到触发 summary
5. 在无 Long-term Memory recall 的情况下询问“你还记得我目前做到哪了吗？”
```

预期：

```txt
Prompt Preview 同时包含 Conversation Summary 与 Recent History；
回复规则不再否定 summary；
AI 能基于 Conversation Summary 回答阶段进度；
Summary Events 展示 load / update / save；
metadata.summarySkipReason 在未触发时可解释。
```
