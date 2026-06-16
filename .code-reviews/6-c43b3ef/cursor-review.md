# 代码审查 — feat(ai-core): 增加会话滚动摘要

**日期：** 2026-06-17
**审查工具：** Cursor
**模型：** Composer
**审查范围：** 最新 commit `c43b3ef8cc0161e63912cc6582cfd1f242670f24`
**引用：** `git show c43b3ef --no-color`（18 文件，+999 / -33 行）
**结论：** 需修改

## 依据规范

- [AGENTS.md](../../AGENTS.md)
- [docs/ai/core/principles.md](../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../docs/ai/core/project-context.md)
- [.cursor/rules/ai-guide.mdc](../../.cursor/rules/ai-guide.mdc)
- [.requirements/stages/stage-04/04-memory-system-patch-1.md](../../.requirements/stages/stage-04/04-memory-system-patch-1.md)
- [apps/model-runtime-demo/README.md](../../apps/model-runtime-demo/README.md)
- [eslint.config.mjs](../../eslint.config.mjs)
- [prettier.config.mjs](../../prettier.config.mjs)

## 摘要

本 commit 落地 stage-04 patch-1「滚动摘要」：新增 `SummaryProvider` / `SummaryUpdater` 抽象与默认实现、`resolveSummaryScope`、`SimpleChatWorkflow` 接入 load/inject/update/save、Demo 面板与 `summary:*` Observer 事件。整体架构与 patch-1 规格高度一致：`Summary` 与 `Memory` 分离、`ai-core` 无 DB 依赖、失败不阻塞主链路、`enabled: false` 默认向后兼容。

本地已执行 `pnpm turbo run typecheck lint build --filter @ying-companion/ai-core --filter @ying-companion/model-runtime-demo`，全部通过。

主要阻塞项：`buildPersonaSystemPrompt` 的回复规则未感知 `summaryContext`，在无长期记忆召回时仍会告诉模型「只能依据短期历史」，与已注入的会话摘要矛盾，直接影响 patch-1 §15.2 类场景。另有阈值边界与文档缺口属中低优先级。

> **备注：** OMX 双车道子代理（`code-reviewer` / `architect`）在当前 Cursor 环境不可用；以下 code-reviewer 与 architect 分析由本审查会话内人工完成，结构与 OMX 模板一致。

## 审查统计

- 审查文件数：18
- 问题总数：8（严重 0 / 高 1 / 中 3 / 低 4）
- code-reviewer 建议：REQUEST CHANGES
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:342-346`] [规范: `.requirements/stages/stage-04/04-memory-system-patch-1.md` §10.1/§15.2] `buildPersonaSystemPrompt` 回复规则第 5 条仅根据 `memoryContext` 分支；当 **有 `summaryContext` 但无长期记忆召回** 时，仍输出「只能依据本轮输入与传入的短期历史回答」，与 system prompt 中已注入的 Conversation Summary 矛盾，模型可能被误导忽略摘要。

  **复现路径：** Demo 启用滚动摘要 → 多轮输入阶段进度（不触发 Memory save 或本轮无 recall）→ 问「你还记得做到哪了吗？」→ Prompt 含 summary 块但规则 5 否定摘要可用性。

  **修复建议：** 将规则 5 改为三分支或组合判断，例如：
  - 有 summary 或 memory →「可以自然参考会话摘要与长期上下文，但不要暴露内部系统」；
  - 仅有 recent history → 保持原文案。

### 中

- [`packages/ai-core/src/implementations/summary/history-utils.ts:20-41`] 当 `recentMessageLimit >= messages.length` 且已超过 `summarizeTriggerMessageCount` 时，`splitForSummary` 返回 `triggered: true` 但 `messagesToSummarize` 为空，workflow 再以 `no_messages_to_summarize` 跳过；Demo 若将 `recentMessageLimit` 调到 ≥ 当前消息数会出现「已触发但无压缩」的困惑状态。patch-1 未禁止该配置组合。

  **修复建议：** 在 `splitForSummary` 或 API 校验中要求 `recentMessageLimit < summarizeTriggerMessageCount`；或在 `triggered && messagesToSummarize.length === 0` 时统一 `reason: below_threshold` 并文档说明。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:1-800`] `SimpleChatWorkflow` 单文件已 ~800 行，本 commit +313 行；summary 逻辑以 `loadSummary` / `updateAndSaveSummary` 内联，与 memory 辅助函数同文件，后续 stage 7 编排扩展时维护成本上升。

  **修复建议：** 非阻塞，但建议将 summary 辅助函数迁至 `implementations/summary/workflow-summary.ts` 或类似模块，workflow 只保留编排（与 patch-1 §16 「纯函数独立」精神一致）。

- [`apps/model-runtime-demo/README.md`] [规范: `docs/ai/core/verification.md`] Demo README 未记录滚动摘要开关、`summaryOptions`、Prompt Debug Panel 新增字段（`summaryContext` / `recentHistory` / `summarizedMessages`），与 patch-1 §14 交付物不一致，影响后续验收与手工测试指引。

  **修复建议：** 在 README「聊天主链路调试」下补充 summary 控件、默认 `enabled: false`、`InMemorySummaryProvider` 进程内存储说明。

### 低

- [`packages/ai-core/src/implementations/summary/model-summary-updater.ts:74-88`] `messageRange` 从未根据 `messagesToSummarize` 或 `input.messageIds` 写入，patch-1 验收项「summary messageRange」在 Demo 中可能长期为空；仅影响调试展示。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:21-24`] 文件头注释仍写「阶段 4」主链路，未提及 Summary；与实现不同步。

- [`apps/model-runtime-demo/app/api/chat/route.ts:35`] 模块级单例 `demoSummaryProvider = new InMemorySummaryProvider()` 在 demo 可接受，但多 worker / 热重载下为进程共享状态；应在 README 注明非生产、非多租户。

- [`packages/ai-core/src/index.ts:23-28`] 公开导出全部 summary 实现类（与 memory 包一致的历史模式）；削弱「仅通过 factory 注入」边界，属长期 WATCH，非本 commit 独有。

## 架构关注项

- [`packages/ai-core/src/abstractions/summary.ts:535-561`] **CLEAR — scope 解析** — `resolveSummaryScope` 独立于 `resolveMemoryScope`，无 scope 返回 `undefined`，不写 `"default"` 垫片，符合 patch-1 §6.1。

- [`packages/ai-core/src/core/companion-core-factory.ts:648-653`] **CLEAR — 插槽注入** — `summary` / `summaryUpdater` 进入 `CompanionCoreContext`、`inspect()`、`core:init`；自定义 `summary` 时自动绑定 `ModelSummaryUpdater`，与 patch-1 §8.4 一致。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:1169-1183`] **CLEAR — 编排顺序** — `Safety(output) → Summary update/save → Memory extract/save`，且 extract 仍用完整 `sanitizedHistory.slice(-6)`，符合 patch-1 §9.1 / §9.7。

- [`packages/ai-core/src/abstractions/workflow.ts:589-598`] **CLEAR — 调试契约** — 扩展 `ChatWorkflowDebugContext`（`summaryContext` / `recentHistory` / `summarizedMessages`），Demo 已改为显式字段展示，符合 patch-1 §12.2 / §14.3。

- [`apps/model-runtime-demo/app/api/chat/route.ts:35`] **WATCH — Demo 边界** — 进程内 `InMemorySummaryProvider` 单例 + 默认 `summaryOptions.enabled: false` 合理；生产应外置 `SummaryProvider` 并持久化，当前无需在本 commit 实现。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts`] **WATCH — 文件体量** — workflow 继续膨胀，建议在 patch-1 收尾或 stage 7 前拆分 summary 编排模块。

## 合成说明

- code-reviewer：**REQUEST CHANGES**（`buildPersonaSystemPrompt` 规则与 summary 注入冲突，影响核心验收场景）
- 架构状态：**WATCH**（分层与 patch-1 对齐良好；workflow 体量与 demo 单例需在文档/后续重构中跟进）
- 最终结论：**需修改**（依据 OMX：code-reviewer = REQUEST CHANGES → 需修改）

## 检查项

### 安全

- [x] 无硬编码密钥；`ai-core` 不读取环境变量
- [x] `summaryOptions` 在 demo API 有类型校验
- [x] Observer 错误 payload 使用安全摘要字符串

### 代码质量

- [x] typecheck / lint / build 通过（ai-core + model-runtime-demo）
- [ ] `buildPersonaSystemPrompt` 回复规则与注入块不一致（高）
- [ ] workflow 单文件过大（中）

### 性能

- [x] summary update 为额外模型调用，由 `enabled` 开关控制
- [x] 未达阈值前不 trim，与 spec 一致（触发前 token 仍会增长，属 V1 预期）

### 项目规范

- [x] Summary 与 Memory Provider 分离
- [x] 无 pg / pgvector 进入 ai-core
- [x] patch-1 核心验收路径（scope、debugContext、Observer、默认 Noop）已实现
- [ ] Demo README 未同步（中）

### 架构

- [x] `CompanionCore` 插槽扩展完整
- [x] `resolveSummaryScope` 与 memory scope 解耦
- [x] 状态：**WATCH**（无 BLOCK）

### 验证

- [x] `pnpm turbo run typecheck lint build --filter @ying-companion/ai-core --filter @ying-companion/model-runtime-demo` — 9 tasks successful
- [ ] patch-1 §15 手工场景（阈值触发、阶段进度、与记忆共存、失败不阻塞）— 审查未在浏览器执行，建议合并前跑一遍

## 备注

- 审查 commit：`c43b3ef8cc0161e63912cc6582cfd1f242670f24`
- OMX 子代理 lane 不可用，双车道结论由本工具内人工合成
- 修复高优先级项后，建议复测 §15.2（无 memory recall 时仅靠 summary 回答阶段进度）
