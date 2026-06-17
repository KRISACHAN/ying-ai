# Cursor Review Follow-up — feat(ai-core): 接入情绪状态机

**Date:** 2026-06-18
**Review Tool:** Codex
**Review Scope:** `.code-reviews/8-74153ae/cursor-review.md` and current implementation
**Reference:** `.code-reviews/8-74153ae/cursor-review.md`
**Verdict:** Approve

## Summary

已逐项核对 Cursor review，并修复其中可落地的代码/文档问题。结论：报告整体有效，没有阻塞级缺陷；中等项已修复，低优先级 DRY/说明项也已处理或文档化。

本 follow-up 不回复 GitHub、不 resolve thread。

## Follow-Up Conclusions

### Accepted and Fixed

1. README “当前实现（阶段 4）”表格仍写 `Emotion.analyze` 未调用。
   - 处理：已更新为“当前实现（阶段 5）”，并说明默认 `DisabledEmotionEngine` 不触发真实 LLM 分析；显式注入 `ModelEmotionEngine` 后会拼入 prompt。
   - 文件：`packages/ai-core/README.md`

2. Demo 原样保存 `output.emotion`，会把 `metadata` 回传下一轮。
   - 处理：已新增 `toPersistedEmotion`，只保存并回传 `current / intensity / updatedAt`。
   - 文件：`apps/model-runtime-demo/app/chat-panel.tsx`

3. `ChatWorkflowInput.emotion` 注释仍写 “Workflow 未消费”。
   - 处理：已改为“上轮伴侣情绪，由宿主传入；Workflow 消费后返回 `output.emotion`”。
   - 文件：`packages/ai-core/src/abstractions/workflow.ts`

4. README 调用序列中 `emotion.analyze` 参数示意不完整。
   - 处理：已补齐 `history / persona / recalledMemories / previous`。
   - 文件：`packages/ai-core/README.md`

5. `prompt-formatter.ts` 与 `emotion.schema.ts` 重复实现 `clamp01`。
   - 处理：已让 formatter 复用 `emotion.schema.ts` 导出的 `clamp01`。
   - 文件：`packages/ai-core/src/implementations/emotion/prompt-formatter.ts`

6. `DisabledEmotionEngine` 默认把情绪回到 neutral 的边界不够明显。
   - 处理：已补充类注释，说明默认 disabled 不保证 previous emotion 连续性；需要连续性时宿主应注入 `ModelEmotionEngine` 或自定义实现。
   - 文件：`packages/ai-core/src/implementations/emotion/disabled-emotion-engine.ts`

### Not Valid

无。Cursor review 中列出的 6 个问题均有效，且本轮已处理。

### Retained Concern

无。

### Unaddressed

无。

## Suggested Response Draft

```text
感谢 review，结论接受，已按建议修复。

本轮 follow-up patch 已处理：

1. 更新 README 中仍停留在阶段 4 的表格和情绪 analyze 参数示意；
2. 修正 ChatWorkflowInput.emotion 的过期注释；
3. demo 保存 emotion 前剥离 metadata，只保留 current / intensity / updatedAt；
4. 复用已有 clamp01；
5. 补充 DisabledEmotionEngine 默认不保证情绪连续性的说明。
6. 同步更新 stage-05 规格文档，明确 demo 回传 emotion 也不能携带 metadata。

不会改变 ai-core 的核心边界：Core 仍不保存情绪、不读 env、不连库；真实情绪连续性仍由宿主显式注入 EmotionEngine 并保存 output.emotion。
```

## Verification

- `pnpm --filter @ying-companion/ai-core build`
- `pnpm --filter @ying-companion/ai-core typecheck`
- `pnpm --filter @ying-companion/model-runtime-demo typecheck`
- `pnpm --filter @ying-companion/ai-core lint`
- `pnpm --filter @ying-companion/model-runtime-demo lint`
- `pnpm --filter @ying-companion/model-runtime-demo build`
- `pnpm exec prettier --check packages/ai-core/README.md packages/ai-core/src/abstractions/workflow.ts packages/ai-core/src/implementations/emotion/disabled-emotion-engine.ts packages/ai-core/src/implementations/emotion/prompt-formatter.ts apps/model-runtime-demo/app/chat-panel.tsx .requirements/stages/stage-05/05-emotion-engine.md`
