# 代码审查复核 — V1.1 Stage 6 Ollama Adapter

**日期：** 2026-06-29
**审查工具：** Codex
**审查范围：** `.code-reviews/v1.1/7-2796f97/cursor-review.md` 及当前实现
**引用：** `.code-reviews/v1.1/7-2796f97/cursor-review.md`
**结论：** 建议

## 依据规范

- `AGENTS.md`
- `docs/ai/core/verification.md`
- `docs/ai/core/working-agreements.md`
- `.requirements/stages/v1.1/stage-06/06-ollama-model-adapter.md`
- `packages/model-ollama/**`
- `node_modules/.pnpm/ollama@0.6.3/node_modules/ollama/dist/shared/ollama.1bfa89da.d.ts`

## 摘要

Cursor review 的总体结论成立：`2796f97` 的 Adapter 边界正确，没有高危或阻塞问题，剩余问题主要是维护性与验收覆盖。本轮复核后已收敛公开导出面、让 `verify:adapter` 自动先 build，并补上 fallback 成功与 mid-stream failure 的离线验证；同时确认本地 Ollama live generate / stream 仍可通过。runtime helper 重复、`isRecord` 小重复与文档总览登记保留为后续非阻塞项。

## 审查统计

- 复核问题数：7
- 已采纳并修复：4
- 不成立：1
- 保留关注：3
- 未处理：0
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

- [`packages/model-ollama/src/index.ts`] 已收敛公开 API，只从根入口导出 `createOllamaChatModel`、`OllamaChatModel`、`OllamaChatModelOptions`、`OllamaFallbackModelOptions`。验证脚本改为相对路径读取 dist 内部 mapper，不再把 mapper 作为宿主公共 API 暴露。
- [`packages/model-ollama/package.json`] 已将 `verify:adapter` 改为 `pnpm build && node scripts/verify-ollama-adapter.mjs`，避免脚本读取过期 `dist`。
- [`packages/model-ollama/scripts/verify-ollama-adapter.mjs`] 已补 fallback 成功与 mid-stream failure 离线验证：`fallbackGenerate.calls = ["missing-primary", "working-fallback"]` 且 `fallbackUsed = true`；`midStreamFailure.calls = ["stream-primary"]`，证明首个可见文本后异常不会切换 fallback。
- [`packages/model-ollama/scripts/verify-ollama-adapter.mjs`] Cursor 提到 live Ollama 验证证据不足。当前脚本已支持 `OLLAMA_VERIFY_MODEL` / `OLLAMA_VERIFY_HOST` live 分支，本轮复核使用 `dzgg/qwen3.5-abliterated:4b` 与 `http://127.0.0.1:11434` 验证通过：`liveGenerate.textLength = 13`，`liveStream.deltaCount = 11`，`liveStream.finished = true`。

### 不成立

- [`packages/model-ollama/src/ollama-message-mapper.ts`] `toolCallId` 未映射到 Ollama tool result 的问题在当前 `ollama@0.6.3` 类型下不成立为可修复缺陷。SDK `Message` 只暴露 `role`、`content`、`tool_calls`、`tool_name`，`ToolCall` 也没有 id 字段；当前实现保留 tool result 的 `tool_name` 与内容，未伪造 SDK 不支持的 call id，符合 Stage 6 “以锁定版本 SDK 类型为准”的约束。

### 保留关注

- [`packages/model-ollama/src/ollama-chat-model.ts`] runtime helper 与 OpenAI Adapter 有重复。Stage 6 独立 Adapter 可以接受该重复；在新增第三个模型 Adapter 前，建议再评估是否抽出共享模型 runtime helper，避免错误语义 drift。
- [`packages/model-ollama/src/ollama-message-mapper.ts` / `packages/model-ollama/src/ollama-tool-mapper.ts`] `isRecord` 重复属于低风险代码整理项；当前重复很小，不影响行为。
- [`AGENTS.md` / `docs/ai/core/project-context.md`] `model-ollama` 尚未写入总览文档。Stage 6 规格把完整文档同步放在 Stage 8，本阶段保留为后续文档收口项。

### 未处理

无。

## 验证

- `pnpm --filter @ying-companion/model-ollama typecheck`：通过
- `pnpm --filter @ying-companion/model-ollama lint`：通过
- `pnpm --filter @ying-companion/model-ollama build`：通过
- `pnpm --filter @ying-companion/model-ollama verify:adapter`：通过，覆盖默认 profile、mapper、tool capability skip、streaming capability skip、primary 失败 fallback 成功、首个可见文本后失败不 fallback
- `OLLAMA_VERIFY_MODEL='dzgg/qwen3.5-abliterated:4b' OLLAMA_VERIFY_HOST='http://127.0.0.1:11434' pnpm --filter @ying-companion/model-ollama verify:adapter`：通过，覆盖上述离线场景及真实 `executeWorkflow()` generate 与 `streamWorkflow()` stream

## 合成说明

- code-reviewer：COMMENT。Cursor 的高价值问题已处理，剩余为维护性整理和阶段性文档收口。
- 架构状态：WATCH。核心边界保持清晰，runtime helper 抽取仍建议在新增下一模型 Adapter 前再处理。
- 最终结论：**建议**。当前实现可以继续作为 Stage 6 交付基础，剩余关注项不阻塞。
