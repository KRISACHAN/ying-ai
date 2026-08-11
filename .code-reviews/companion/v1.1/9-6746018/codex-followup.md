# 代码审查复核 — Ollama 结构化记忆抽取

**日期：** 2026-06-30
**审查工具：** Codex
**模型：** GPT-5
**审查范围：** `.code-reviews/v1.1/9-6746018/cursor-review.md` 及当前实现
**引用：** `.code-reviews/v1.1/9-6746018/cursor-review.md`
**结论：** 建议

## 依据规范

- `AGENTS.md`
- `docs/ai/core/principles.md`
- `docs/ai/core/working-agreements.md`
- `docs/ai/core/verification.md`
- `docs/ai/core/project-context.md`
- `packages/ai-core/README.md`
- `packages/model-ollama/README.md`
- `apps/model-runtime-demo/README.md`
- `.codex/skills/code-review-followup/SKILL.md`

## 摘要

Cursor 的主要判断成立：commit `6746018` 的修复方向正确，Core 仍通过 `ChatModel`
抽象扩展结构化输出，OpenAI-compatible 走 Vercel AI SDK `Output.object`，Ollama 走
`format: "json"` 后 schema 校验。复核发现没有阻塞合并的 Critical/High 问题。本轮已修复
契约注释、空文本校验、README 与实现不一致、memory extractor 注释，以及 extractor
缺少直接验证的问题；demo 默认模型和 Ollama JSON Schema 增强保留为后续关注。

## 审查统计

- 复核问题数：9
- 已采纳并修复：5
- 不成立：1
- 保留关注：3
- 未处理：0
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

- [`packages/ai-core/README.md`] README 表格已限定为 `MemoryExtractor` 使用
  `GenerateInput.structuredOutput`，不再把仍解析 `output.text` 的 `ModelSummaryUpdater`
  写成已迁移。

- [`packages/ai-core/src/abstractions/model.ts`] `structuredOutput` 契约已改为：adapter
  收到该字段时必须填充 `GenerateOutput.structuredOutput`，或显式抛出不支持结构化输出的错误。

- [`packages/ai-core/src/implementations/model/openai.ts`] 与
  [`packages/model-ollama/src/ollama-chat-model.ts`] 的 `validateGenerateOutput` 已把
  `structuredOutput !== undefined` 视为有效输出，允许纯结构化对象响应。

- [`packages/ai-core/src/implementations/memory/model-memory-extractor.ts`] 文件头、`extract()`
  注释和重试提示已改为结构化输出语义；缺失 `GenerateOutput.structuredOutput` 时会给出明确错误。

- [`packages/ai-core/scripts/verify-memory-extractor.mjs`] 已新增直接验证：happy path 会确认
  extractor 请求 `structuredOutput` 并抽取事件记忆；缺失 `structuredOutput` 时会断言明确错误信息。

### 不成立

- [`packages/model-ollama/src/ollama-chat-model.ts`] “adapter 与 extractor 双重 Zod 校验”不构成问题。adapter 层校验是 provider 边界保护，extractor 层再次按自身 schema 读取是 consumer 边界保护；成本相对 LLM 调用可忽略，且有助于第三方 adapter 返回异常时保持安全失败。可后续简化，但不应作为缺陷处理。

### 保留关注

- [`apps/model-runtime-demo/app/lib/model-config.ts`]、[`apps/model-runtime-demo/app/conversation-workspace.tsx`] 与 [`apps/model-runtime-demo/.env.example`] 将默认 Ollama 模型改为维护者本地模型。该 finding 成立。作为本地验证记录可以接受，但作为 repo 默认值会降低新环境可移植性；建议恢复通用默认模型，并在 README 记录已验证模型。

- [`packages/model-ollama/src/ollama-message-mapper.ts`] 目前只设置 `format: "json"`，没有传 JSON Schema。该 finding 成立且属于增强项。已核对 `ollama` SDK 类型，`ChatRequest.format` 支持 `string | object`；后续可从 schema 派生 JSON Schema 后传给 Ollama，提升约束强度。

- [`apps/model-runtime-demo/app/conversation-workspace.tsx`] OpenAI provider 切换默认值改为 `gpt-4o-mini` 与本次记忆修复正交。该 finding 成立。若保留，应在单独提交或提交说明中解释；否则建议拆出或恢复。

### 未处理

无阻塞项。本轮未改代码；上述有效问题均为非阻塞关注，建议后续单独修复。

## 验证

- `pnpm --filter @ying-companion/ai-core typecheck`：通过
- `pnpm --filter @ying-companion/ai-core lint`：通过
- `pnpm --filter @ying-companion/ai-core build`：通过
- `pnpm --filter @ying-companion/ai-core verify:memory-extractor`：通过，输出包含
  `structuredOutputRequested = "object"` 与 `missingStructuredOutput = "clear-error"`
- `pnpm --filter @ying-companion/model-ollama typecheck`：通过
- `pnpm --filter @ying-companion/model-ollama lint`：通过
- `pnpm --filter @ying-companion/model-ollama verify:adapter`：通过，输出包含 `jsonResponseFormat.requestFormat = "json"` 与 `structuredOutput.ok = true`

## 合成说明

- code-reviewer：COMMENT
- 架构状态：WATCH
- 最终结论：**建议**。Cursor review 没有发现阻塞缺陷；本轮已收敛结构化输出契约、校验语义、文档一致性和 extractor 验证。剩余关注主要是 demo 默认模型可移植性与 Ollama JSON Schema 增强。
