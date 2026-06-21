# 代码审查 — feat(ai-core): 接入情绪状态机

**日期：** 2026-06-17
**审查工具：** Cursor
**模型：** Composer
**审查范围：** commit `74153ae`（HEAD）
**引用：** `git show 74153ae --no-color`（12 文件，+约 900 行）
**结论：** 建议

## 依据规范

- [AGENTS.md](../../AGENTS.md)
- [docs/ai/core/principles.md](../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../docs/ai/core/project-context.md)
- [docs/ai/core/git-protocol.md](../../docs/ai/core/git-protocol.md)
- [.cursor/rules/ai-guide.mdc](../../.cursor/rules/ai-guide.mdc)
- [.cursor/rules/project-context.mdc](../../.cursor/rules/project-context.mdc)
- [.requirements/stages/stage-05/05-emotion-engine.md](../../.requirements/stages/stage-05/05-emotion-engine.md)
- [eslint.config.mjs](../../eslint.config.mjs)
- [prettier.config.mjs](../../prettier.config.mjs)

## 摘要

本 commit 落地 stage-5 情绪状态机：`EmotionDebugMetadata` 类型化、`ModelEmotionEngine`（LLM + Zod + retry/timeout）、`transitionEmotion` 纯函数同步转移、`SimpleChatWorkflow` 在 recall 之后注入情绪、demo 显式注入 `ModelEmotionEngine` 并回传/展示情绪。

实现与 `05-emotion-engine.md` 高度一致：伴侣意向情绪语义、`transition` 同步、`ai-core` 不读 env、失败降级不阻断主链路、Observer 事件完整。本地已执行 `pnpm --filter @ying-companion/ai-core build lint` 与 `pnpm --filter model-runtime-demo build`，均通过。

无阻塞缺陷；存在 README 目标态表格未同步、demo 持久化字段边界、少量注释/DRY 问题。

> **备注：** OMX 双车道（`code-reviewer` / `architect`）在本会话内由审查者按 OMX 模板人工完成双车道分析。

## 审查统计

- 审查文件数：12
- 问题总数：6（严重 0 / 高 0 / 中 3 / 低 3）
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`packages/ai-core/README.md:215-217`] [规范: `.requirements/stages/stage-05/05-emotion-engine.md`] 「与当前 SimpleChatWorkflow 的差异」表格仍写「当前实现（阶段 4）」且 `Emotion.analyze` 为 ❌ 未调用；stage 5 已接入 Workflow，与事实不符，易误导后续阶段 6/7 集成者。

  **修复建议：** 将表头改为「当前实现（阶段 5）」，`Emotion.analyze` 行改为 ✅ 已拼入 prompt（需宿主注入 `ModelEmotionEngine`）；补充说明默认 `createCompanionCore` 仍用 `DisabledEmotionEngine` 时 analyze 返回 neutral、无额外 LLM。

- [`apps/model-runtime-demo/app/chat-panel.tsx:130`] [规范: `05-emotion-engine.md` §16.4 / README L393] `setEmotion(output.emotion ?? null)` 将完整 `EmotionState`（含 `metadata.transitionRule` / `failed` 等调试字段）原样回传下一轮；规格要求宿主持久化仅 `current / intensity / updatedAt`。

  **复现路径：** 触发一次 analyze 失败或正常转移后，观察请求 body 中 `emotion.metadata` 是否携带 `transitionRule`。

  **当前影响：** 不影响 Core 正确性，但 demo 作为集成范例会强化错误持久化习惯。

  **修复建议：** 保存前剥离 metadata，或复用 `chat/route.ts` 的 `normalizeEmotion` 逻辑：

  ```ts
  function toPersistedEmotion(emotion: EmotionState): EmotionState {
    return {
      current: emotion.current,
      intensity: emotion.intensity,
      ...(emotion.updatedAt !== undefined ? { updatedAt: emotion.updatedAt } : {}),
    };
  }
  ```

- [`packages/ai-core/src/abstractions/workflow.ts:31`] 注释仍写「阶段 5 前由宿主传入但 Workflow 未消费」，与当前实现矛盾。

  **修复建议：** 改为「上轮伴侣情绪，由宿主传入；Workflow 消费后返回 `output.emotion`」。

### 低

- [`packages/ai-core/src/implementations/emotion/prompt-formatter.ts:25-31`] 与 [`emotion.schema.ts:40-46`] 各有一份 `clamp01` 实现，轻微重复。

  **修复建议：** 从 `emotion.schema.ts` 导出并在 formatter 中复用，或抽到 `emotion/utils.ts`（非必须）。

- [`packages/ai-core/README.md:240-241`] 流程示意中 `emotion.analyze` 仅列出 `{ message, previous }`，未体现 stage-5 已传入的 `history / persona / recalledMemories`。

  **修复建议：** 与 `EmotionAnalyzeInput` 对齐更新示意。

- [`packages/ai-core/src/implementations/emotion/disabled-emotion-engine.ts:29-31`] `DisabledEmotionEngine`：`analyze` 固定 neutral，`transition` 透传 detected，导致宿主传入的 `input.emotion` 每轮被重置为 neutral（即使未调 LLM）。

  **当前影响：** 符合「默认关闭真实情绪」预期；仅当宿主传了 previous 却未注入 `ModelEmotionEngine` 时行为可能令人困惑。

  **修复建议：** 在 README 或 `DisabledEmotionEngine` 类注释中明确这一边界即可，无需改逻辑。

## 架构关注项

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:357-417`] **CLEAR** — `analyzeAndTransitionEmotion` 失败回退 previous/neutral、不阻断 generate；`failed` 时跳过 `transition`，避免对 fallback 误用 neutral 衰减规则。与规格一致。

- [`packages/ai-core/src/abstractions/emotion.ts`] **CLEAR** — `EmotionDebugMetadata`、`EmotionAnalyzeInput` 扩展、`transition` 同步签名，边界清晰；`ai-core` 无 env/DB 依赖。

- [`packages/ai-core/src/implementations/emotion/transition.ts:18-55`] **CLEAR** — 转移规则优先级（strong_override → neutral_decay → same_boost → switch）与文档 §8.2 一致。

- [`apps/model-runtime-demo/app/api/chat/route.ts:186`] **WATCH** — Demo 每轮固定 `ModelEmotionEngine`，单轮至少 +1 次 LLM（叠加 memory extract）。符合 stage-5 验收，但正式产品需配置开关；V1.1 合并 analyze 方向已在需求文档 §15.4 记录，实现层无需本 commit 处理。

- [`packages/ai-core/src/implementations/emotion/transition.ts:79-90`] **WATCH** — `next` 状态的 `metadata` 仅保留 `transitionRule`，analyze 的 `confidence/reason` 不进入最终持久化字段；符合规格，宿主应只存稳定字段（见上 demo 中项）。

## 合成说明

- code-reviewer：**COMMENT** — 实现质量良好，无安全/正确性阻塞；主要为文档与 demo 持久化范例需对齐规格。
- 架构状态：**WATCH** — 性能成本与持久化边界需在文档/demo 层说清，不构成 merge 阻塞。
- 最终结论：**建议**（依据 OMX：architect = WATCH → 建议）

## 检查项

### 安全

- [x] 无硬编码密钥；chat route 校验 `emotion` 字段；无注入面
- [x] 情绪 Prompt 明确要求不做医学诊断

### 代码质量

- [x] 模块职责清晰；`transition` 纯函数可单测
- [ ] 少量 `clamp01` 重复（低）

### 性能

- [x] 每轮 +1 LLM 为规格预期；有 retry/timeout 上限
- [ ] 未做 analyze 与 recall 并行（规格 V1 允许串行）

### 项目规范

- [x] `ai-core` 纯 SDK；`meta.id = emotion.model`；Observer 无 console
- [x] ESLint / tsc build 通过
- [ ] README 目标态表格与注释需同步（中）

### 架构

- [x] 插槽可替换；Workflow 只调抽象
- [x] 情绪与 memory 存储隔离
- [x] 状态：WATCH（性能/持久化边界文档化）

### 验证

- [x] `pnpm --filter @ying-companion/ai-core build` — 通过
- [x] `pnpm --filter @ying-companion/ai-core lint` — 通过
- [x] `pnpm --filter model-runtime-demo build` — 通过
- [ ] 未执行人工三轮对话验收（需 OPENAI 密钥与运行中 demo）

## 备注

- 审查范围仅为 commit `74153ae`；工作区干净，无未提交变更。
- 若合并前修复，优先：README 表格 + `workflow.ts` 注释 + demo `setEmotion` 剥离 metadata（约 15 分钟）。
- 独立 lane 子代理未单独启动；本报告由审查者按 OMX 双车道标准人工合成。
