# 代码审查 — feat(ai-core): 接入本地工具调用系统

**日期：** 2026-06-18
**审查工具：** Cursor
**模型：** Composer
**审查范围：** commit `ae86fee`（HEAD）
**引用：** `git show ae86fee --no-color`（13 文件，+896 / -75 行）
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
- [.requirements/stages/stage-06/06-tool-system.md](../../.requirements/stages/stage-06/06-tool-system.md)
- [eslint.config.mjs](../../eslint.config.mjs)
- [prettier.config.mjs](../../prettier.config.mjs)

## 摘要

本 commit 落地 stage-6 本地工具调用闭环：`LocalToolRegistry`、`tool-adapter`（`toModelTools` / `toCoreToolCall` / `buildToolFollowUpMessages`）、`SimpleChatWorkflow` 非流式工具循环（`maxToolRounds=1`）、`ModelToolCall.id` / `ChatMessage.toolCallId` 补全、OpenAI 实现层 `tool` role 映射，以及 demo 宿主注册三工具 + Tools Panel。

实现与 `06-tool-system.md` 高度一致：ModelToolCall ≠ ToolCall 分层、ToolResult 顶层 `ok`/`error` 不嵌套进 `result`、`ai-core` 无 env/DB/console、工具由宿主显式注入、follow-up 使用 `role: "tool"` 标准消息。本地已执行 `pnpm --filter @ying-companion/ai-core typecheck build` 与 `pnpm --filter @ying-companion/model-runtime-demo build`，均通过。

无阻塞缺陷；存在 debug 语义漂移、demo 情绪工具快照过期、二次 generate 的 toolCalls 静默丢弃、文档注释未同步等可改进项。

## 审查统计

- 审查文件数：13
- 问题总数：9（严重 0 / 高 0 / 中 4 / 低 5）
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`packages/ai-core/src/abstractions/workflow.ts:80-81`] [规范: `06-tool-system.md` §13 / §8.5] `ChatWorkflowDebugContext.messages` 注释仍写「最终传入 model.generate 的 messages」，实际写入的是首次 generate 前的 `messages`（`simple-chat-workflow.ts:265`）；触发工具二次生成时，最终模型输入在 `toolFollowUpMessages`。Tools Panel 已单独展示 follow-up 消息，但 Prompt Debug Panel 仍只读 `messages`，无法 100% 还原最终模型输入。

  **修复建议：** 二次生成后将 `messages` 更新为 `followUpMessages`，或改注释为「首次 generate 输入」，并在 Prompt Debug Panel 有 follow-up 时优先展示 `toolFollowUpMessages`。

- [`apps/model-runtime-demo/app/api/chat/route.ts:213-220,306-310`] [规范: `06-tool-system.md` §9.3 / §15.5] `createDemoTools` 在 workflow 执行前用 `inputEmotion` 闭包绑定 `get_emotion_state`，而主链路在 workflow 内 `analyzeAndTransitionEmotion` 后得到 `emotionResult.next` 并注入 prompt；工具返回的是请求前情绪快照，与 prompt 情绪块可能不一致。

  **复现路径：** 发送「你现在是什么心情？」，对比 Prompt Debug 中 emotionContext 与 Tools Panel 中 `get_emotion_state` 返回值。

  **当前影响：** 不影响 Core 正确性，但削弱 demo 对工具能力的验证可信度。

  **修复建议：** 用可变 ref 在 workflow 后更新，或通过 `ToolExecuteInput.metadata` 注入 emotion getter，在 execute 时读取最新状态。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:454-477`] [规范: `06-tool-system.md` §5.2] `maxToolRounds=1` 下二次 `generate` 若再返回 `toolCalls`，会留在 `finalOutput.toolCalls` 与 observer payload 中，但不会执行第三轮；若同时 `text` 为空，用户可能得到空回复且无明确告警。

  **修复建议：** follow-up 后若 `finalOutput.toolCalls?.length > 0`，在 metadata 增加 `toolCallsDropped: true` 或 observer 警告事件。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:176-180`] [规范: `06-tool-system.md` §12.1] 有工具时未在 system prompt 加入轻量工具能力说明（时间/记忆/情绪可调用工具、勿暴露内部调用）。对部分 OpenAI-compatible provider 可能影响工具选择率。

  **修复建议：** `buildPersonaSystemPrompt` 在 `toolDefinitions.length > 0` 时追加 1–2 行说明。

### 低

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:46-58`] 类注释仍写「阶段 5」「不执行模型返回的 toolCalls」，与 stage-6 实现矛盾。

  **修复建议：** 更新为阶段 6 编排顺序，删除过时约束。

- [`packages/ai-core/src/implementations/tool/empty-tool-registry.ts:1-12`] 注释仍写「阶段 6 前」，与当前默认占位语义不符。

- [`packages/ai-core/src/implementations/tool/format-tool-results.ts:5-16`] 模型侧序列化在 content 字符串中包含顶层 `ok` 字段；与 ToolResult 领域层「`ok`/`error` 不与 `result` 嵌套」的语义在调试时易混淆。功能可用，建议注释说明「此为传给模型的 JSON 摘要，非 ToolResult 结构」。

- [`packages/ai-core/src/index.ts`] 从 public API 导出 `tool-adapter`、`format-tool-results` 实现细节，增加宿主对 AI SDK 耦合函数的依赖面。可接受，但阶段 7 可考虑收敛导出。

- **测试缺失** [规范: `docs/ai/core/verification.md`] — 无 `LocalToolRegistry` / `tool-adapter` / `generateWithTools` 相关单测；跨层适配（JSON parse、tool role 映射、NOT_FOUND / handler throw）缺少回归保护。

## 架构关注项

- [`packages/ai-core/src/implementations/tool/tool-adapter.ts:7-24`] **WATCH** — `toModelTools` 产出 Vercel AI SDK `ToolSet`，`buildToolFollowUpMessages` 假定 OpenAI function-calling 协议（`assistant.toolCalls` + `role: "tool"`）。名义上 `ChatModel` 是统一边界，实际工具链路隐性绑定 AI SDK + OpenAI 形态；换非 AI SDK 后端需重写适配层。

- [`packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts:387-478`] **WATCH** — 约 230 行工具循环内嵌在 `SimpleChatWorkflow`（`listTools` / `generateWithTools` / `executeToolCalls`），`maxToolRounds` 为模块常量不可注入。阶段 7 编排抽象（`ToolStep` / `AgentLoop`）将面临搬迁成本。

- [`apps/model-runtime-demo/app/api/chat/route.ts:213-234`] **WATCH** — demo 工具 handler 通过闭包绑定 workflow 前状态（情绪），与主链路 Provider 注入模式不一致，易形成错误集成范例。

**做得好的边界（支撑 WATCH 而非 BLOCK）：**

- `LocalToolRegistry` 纯内存、无 env/DB/console；工具失败返回受控 `ToolResult`，不炸穿 Workflow
- 无工具时 `toModelTools([])` → `undefined`，行为与阶段 5 一致
- `createCompanionCore` 默认 `EmptyToolRegistry`，工具由宿主显式注册
- 执行顺序符合 spec：Persona → Safety → Memory → Emotion → tools.list → generate → execute → follow-up → Safety(output)
- `openai.ts:238-276` 正确映射 `assistant+toolCalls` 与 `role: "tool"` 到 Vercel AI SDK `ModelMessage`

## 合成说明

- code-reviewer：**COMMENT** — 核心闭环到位，无 CRITICAL/HIGH；主要缺口在可观测性语义、demo 情绪工具、follow-up 边界与 spec 可选项
- 架构状态：**WATCH** — 适配层隐性绑定 AI SDK、Workflow 膨胀、零自动化测试
- 最终结论：**建议**（依据 OMX：architect = WATCH → 建议）

## 检查项

### 安全

- [x] 无硬编码密钥；工具 handler 异常受控返回
- [x] `ai-core` 不读 env、不连库
- [ ] 工具参数校验依赖 handler 自行处理（`search_memory` demo 有基础校验）

### 代码质量

- [x] 类型分层清晰（ToolDefinition / ModelToolCall / ToolCall / ToolResult）
- [ ] 类注释与实现不同步（Workflow、EmptyToolRegistry）
- [ ] `SimpleChatWorkflow` 文件继续膨胀（1100+ 行）

### 性能

- [x] 多 tool call 顺序执行，V1 合理
- [x] 单轮最多 2 次 generate（首次 + follow-up）

### 项目规范

- [x] stage-06 核心完成标准（LocalToolRegistry、适配层、Workflow 接入、Observer）
- [x] ToolResult `ok`/`error` 顶层，失败 `result: null`
- [ ] §12.1 system prompt 工具说明未落地
- [x] ESLint / TypeScript build 通过

### 架构

- [x] SDK 边界干净（工具注册、执行、观测分离）
- [ ] 工具适配与 AI SDK 隐性耦合；公开导出 adapter 函数
- [ ] 状态：**WATCH**

### 验证

- [x] `pnpm --filter @ying-companion/ai-core typecheck` — 通过
- [x] `pnpm --filter @ying-companion/ai-core build` — 通过
- [x] `pnpm --filter @ying-companion/model-runtime-demo build` — 通过
- [ ] 无自动化单测；建议手动验收「现在几点了？」/ 未知工具 / handler 抛错

## 备注

- 审查 commit：`ae86feeedcda0d42eb0fe87eadac61434d2a396f`
- OMX 双车道（code-reviewer + architect）均已在本轮完成
- 未审查范围：流式 `stream` + 工具循环（spec 明确 V1 不做）、远程 Tool / MCP
- 合并前建议优先：同步 Workflow 注释、修复 demo `get_emotion_state` 快照、明确 follow-up 后 toolCalls 丢弃的可观测性
