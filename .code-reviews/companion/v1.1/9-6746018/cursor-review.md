# 代码审查 — Ollama 结构化记忆抽取修复

**日期：** 2026-06-30  
**审查工具：** Cursor  
**模型：** Composer  
**审查范围：** commit `6746018`（HEAD，`fix(memory): 支持 Ollama 结构化记忆抽取`）  
**引用：** `git rev-parse HEAD` → `6746018a6cd7ab1d7241f5adb39fc5732e482032` · `git show 6746018 --stat`  
**结论：** 建议

---

## 依据规范

- [AGENTS.md](../../../AGENTS.md)
- [docs/ai/core/principles.md](../../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../../docs/ai/core/project-context.md)
- [docs/ai/core/git-protocol.md](../../../docs/ai/core/git-protocol.md)
- [.cursor/rules/ai-guide.mdc](../../../.cursor/rules/ai-guide.mdc)
- [.cursor/rules/project-context.mdc](../../../.cursor/rules/project-context.mdc)
- [eslint.config.mjs](../../../eslint.config.mjs)
- [prettier.config.mjs](../../../prettier.config.mjs)
- [apps/model-runtime-demo/README.md](../../../apps/model-runtime-demo/README.md)
- [packages/ai-core/README.md](../../../packages/ai-core/README.md)
- [packages/model-ollama/README.md](../../../packages/model-ollama/README.md)

---

## 摘要

本 commit 针对 Ollama 长期记忆无法写回的问题，根因是 `ModelMemoryExtractor` 从 `output.text` 手工截取 JSON，而 Ollama 模型常在 JSON 外包裹说明文字。修复在 Core 层新增 `GenerateInput.structuredOutput` 契约：OpenAI-compatible 走 Vercel AI SDK `Output.object`，Ollama 映射为 `format: "json"` 并在 adapter 内 Zod 校验，记忆抽取改为读取 `output.structuredOutput`。

架构方向正确，边界清晰，已覆盖 adapter 验证脚本，工程检查全部通过。无严重/高优先级阻塞项；主要遗留为契约注释与 README 表述不一致、Summary/Emotion 尚未迁移、demo 默认模型过于本地化，以及 `validateGenerateOutput` 未考虑纯结构化响应。

---

## 审查统计

- 审查文件数：12（+140 / −42）
- 问题总数：9（严重 0 / 高 0 / 中 4 / 低 5）
- code-reviewer 建议：COMMENT（实质为 APPROVE with follow-ups）
- 架构状态：WATCH

---

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`packages/ai-core/README.md:341`] [规范: packages/ai-core/README.md] README 表格将 `SummaryUpdater` 与 `MemoryExtractor` 一并标注为使用 `GenerateInput.structuredOutput`，但 `ModelSummaryUpdater` 仍通过 `parseJsonObject(output.text)` 解析自由文本（`model-summary-updater.ts:76`），文档与实现不一致。

  **修复建议：** 要么将 `ModelSummaryUpdater` 迁移到同一契约（推荐，消除 Ollama 同类故障），要么将 README 限定为「当前仅 `ModelMemoryExtractor` 已迁移」。

- [`packages/ai-core/src/abstractions/model.ts:30-31`] [规范: AGENTS.md V1.1 边界] 注释写「不支持的 adapter **可忽略** `structuredOutput`」，但 `ModelMemoryExtractor` 已硬依赖 `output.structuredOutput`（`model-memory-extractor.ts:77`）。第三方 adapter 若忽略该字段，会在 Zod 层失败且重试提示仍指向「JSON 格式」，排障困难。

  **修复建议：** 将注释改为「调用方声明 `structuredOutput` 时，adapter 必须填充 `GenerateOutput.structuredOutput` 或显式抛出」；可选在 extractor 内对 `undefined` 给出明确错误。

- [`packages/ai-core/src/implementations/model/openai.ts:354-357`] · [`packages/model-ollama/src/ollama-chat-model.ts:332-335`] `validateGenerateOutput` 仅在 `text` 为空且无 `toolCalls` 时抛错，未将 `structuredOutput` 视为有效输出。若 provider 返回空 `text` 但含结构化对象，可能在到达 extractor 前失败。

  **修复建议：** 扩展校验：`structuredOutput !== undefined` 或 `(toolCalls?.length ?? 0) > 0` 时通过。

- [`apps/model-runtime-demo/app/lib/model-config.ts:88`] · [`conversation-workspace.tsx:397`] · [`.env.example:17`] 默认 Ollama 模型由通用 `llama3.1` 改为维护者本地模型 `dzgg/gemma-4-abliterated:e2b-v2`。新 clone 在未 pull 该模型时会直接报错，与 demo 可移植性不符。

  **修复建议：** 代码 fallback 保持通用模型（如 `llama3.1` / `qwen3:8b`）；在 README / acceptance 中记录「已验证可写回记忆的模型」即可，不必写入默认常量。

### 低

- [`packages/ai-core/src/implementations/memory/model-memory-extractor.ts:4-5,58`] 文件头与 `extract()` 注释仍描述「JSON 输出 / JSON 解析失败」，与 `structuredOutput` 路径不符。

  **修复建议：** 更新注释为 structured output 语义。

- [`packages/model-ollama/src/ollama-chat-model.ts:187`] · [`model-memory-extractor.ts:77`] adapter 与 extractor 双重 Zod 校验，冗余但无害。

  **修复建议：** 单层校验即可（优先 adapter 或 extractor 其一）。

- [`packages/model-ollama/src/ollama-message-mapper.ts:53-54`] Ollama 仅设置 `format: "json"`，未传入 JSON Schema，约束弱于 OpenAI `Output.object({ schema })`，仍依赖 prompt + 事后 Zod。

  **修复建议：** 后续可在 Ollama 支持时传入 schema 派生的 JSON Schema。

- [`apps/model-runtime-demo/app/conversation-workspace.tsx:400`] OpenAI provider 切换默认由 `model: ""` 改为 `gpt-4o-mini`，与记忆修复正交，属 commit 范围蔓延。

  **修复建议：** 拆分 commit 或在 message body 说明。

- [`packages/ai-core`] 无 `ModelMemoryExtractor` + `structuredOutput` 单元测试；覆盖仅来自 `verify-ollama-adapter.mjs` 注入 client 场景。

  **修复建议：** 增加 fake adapter 契约测试（happy path + 缺失 `structuredOutput` 的明确失败）。

---

## 架构关注项

- [`packages/ai-core/src/abstractions/model.ts:36-41`] **WATCH** — 在抽象层引入 `z.ZodType` 使公开 `ChatModel` 契约与 Zod 耦合；对 V1.1 内聚实现可接受，但长期宜改为 adapter 中性的 `parse(value: unknown)` 包装。

- [`packages/ai-core/src/implementations/summary/model-summary-updater.ts:76`] · [`emotion.schema.ts:26`] **WATCH** — 记忆路径已修复，Summary / Emotion 仍用 `parseJsonObject`，Ollama 上存在同类 JSON 包裹风险；建议 follow-up 统一迁移。

- [`packages/ai-core/src/abstractions/model.ts:30`] **WATCH** — 「可忽略」与 consumer 硬依赖矛盾，需在合并后尽快修正契约文档，避免后续 adapter 作者误读。

- [`apps/model-runtime-demo/app/lib/model-config.ts:88`] **WATCH** — 将本地验证模型硬编码为 repo 默认值，与 `model-ollama/README.md` 推荐的 `qwen3:8b` 及通用 demo 预期不一致。

**无阻塞架构问题（非 BLOCK）。** Core 扩展落在 `ChatModel.generate` 边界内，符合「Workflow 不直连 provider」原则；OpenAI 与 Ollama 均已实现且 verify 脚本覆盖 JSON mode。

---

## 合成说明

- code-reviewer：COMMENT（修复正确、可合并，建议处理文档与 demo 默认值）
- 架构状态：WATCH
- 最终结论：**建议**（依据 OMX：architect = WATCH → 建议；code-reviewer = COMMENT → 建议）

---

## 检查项

### 安全

- [x] 无硬编码密钥；抽取 prompt 仍含用户/助手内容（既有行为）
- [x] Zod 约束 type/enum；`content` 为自由文本（记忆场景预期）
- [x] `structuredOutput` / `raw` 未写入 Wire Event（符合 V1.1 边界）

### 代码质量

- [x] 移除 brittle 的 markdown JSON 截取逻辑
- [ ] README / 注释与实现一致（见中优先级 M1、L1）
- [ ] 契约注释准确（见 M2）

### 性能

- [x] 记忆抽取仍为每轮一次 `generate`（成本模型未变）
- [x] 双重 Zod 相对 LLM 延迟可忽略

### 项目规范

- [x] `ai-core` 不读 env；配置仍在 demo 宿主
- [x] ESLint `import type`、无 `any` 违规
- [x] typecheck / lint 通过

### 架构

- [x] 边界扩展在 `ChatModel` 层，Workflow 无 provider 分支
- [ ] Summary/Emotion 结构化输出 parity（follow-up）
- [x] 架构状态 WATCH（已记录）

### 验证

- [x] `pnpm typecheck` — 6/6 ✅
- [x] `pnpm lint` — 6/6 ✅
- [x] `pnpm --filter @ying-companion/model-ollama verify:adapter` — ✅（含新增 `jsonResponseFormat`）
- [ ] 启用 Postgres + Ollama 的端到端记忆写回（需本地 Ollama 与 DB，未在本环境执行）

---

## 备注

- 审查范围：commit `6746018` 全量 diff（12 文件）；未审查未改动的 `ModelSummaryUpdater` / Emotion 实现细节 beyond 一致性对比。
- 双车道 review 均已在本 session 独立完成（code-reviewer + architect subagent）。
- 合并建议：可合并以修复 Ollama 记忆 bug；合并前或紧随其后建议处理 **M4**（demo 默认模型）与 **M1/M2**（文档/契约），并规划 Summary/Emotion 迁移 follow-up。
