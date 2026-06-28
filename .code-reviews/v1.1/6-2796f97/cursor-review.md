# 代码审查 — V1.1 Stage 6 Ollama Adapter（commit 2796f97）

**日期：** 2026-06-29  
**审查工具：** Cursor  
**模型：** Composer  
**审查范围：** commit `2796f97`（`feat(model-ollama): 新增 Ollama 聊天模型适配器`）  
**引用：** `git show 2796f97` · `packages/model-ollama/**`  
**结论：** 建议

---

## 依据规范

- [`AGENTS.md`](../../../AGENTS.md)
- [`docs/ai/core/principles.md`](../../../docs/ai/core/principles.md)
- [`docs/ai/core/working-agreements.md`](../../../docs/ai/core/working-agreements.md)
- [`docs/ai/core/verification.md`](../../../docs/ai/core/verification.md)
- [`docs/ai/core/project-context.md`](../../../docs/ai/core/project-context.md)
- [`.cursor/rules/ai-guide.mdc`](../../../.cursor/rules/ai-guide.mdc)
- [`eslint.config.mjs`](../../../eslint.config.mjs)
- [`prettier.config.mjs`](../../../prettier.config.mjs)
- [`.requirements/stages/v1.1/stage-06/06-ollama-model-adapter.md`](../../../.requirements/stages/v1.1/stage-06/06-ollama-model-adapter.md)

> **双通道说明：** code-reviewer 与 architect 维度由本审查集成完成；architect 子 agent 已并行审阅同一 commit。

---

## 摘要

`2796f97` 新增 `@ying-companion/model-ollama`，整体符合 Stage 6 架构约束：独立 package、仅依赖 `ai-core` + `ollama`、不读 env、实现完整 `ChatModel`（`meta` / profile / generate / stream / capability 筛选 / retry-fallback 边界）。与 `openai.ts` 在 stream 首 token 前 fallback、自动 merge `streaming: true`、AI SDK dynamic tool 映射等关键语义上对齐。

`pnpm typecheck` / `pnpm lint`（6 包）与 `@ying-companion/model-ollama` 的 `build` + `verify:adapter` 均已通过。未发现严重安全或契约破坏问题；主要遗留是 runtime 逻辑与 OpenAI Adapter 重复、公开导出面偏宽、验证脚本未覆盖 fallback / 流中途失败等 Stage 6 验收场景。

---

## 审查统计

- 审查文件数：12（package 内 11 个源/配置/脚本 + 与 `openai.ts` 对照）
- 问题总数：7（严重 0 / 高 0 / 中 3 / 低 4）
- code-reviewer 建议：**COMMENT**
- 架构状态：**WATCH**

---

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`packages/model-ollama/src/index.ts:1-8`] **公开 API 面宽于 Stage 6 §6.3 建议**

  除 `createOllamaChatModel` / 选项类型外，还导出了 `toOllamaMessages`、`toOllamaTools`、`NormalizedOllamaChatModelOptions` 等内部 mapper 与规范化类型。宿主应只依赖工厂入口；mapper 暴露会增加后续重构成本。

  **修复建议：** 公开导出收敛为 `createOllamaChatModel`、`OllamaChatModel`（可选）、`OllamaChatModelOptions`、`OllamaFallbackModelOptions`；验证脚本改为 deep import 或 `@ying-companion/model-ollama/internal` 子路径。

- [`packages/model-ollama/src/ollama-chat-model.ts:268-404`] **与 `openai.ts` 大量重复的 runtime 辅助逻辑**

  `createRuntimeState`、`createRuntimeInfo`、`createFinalModelError`、`toSafeErrorMessage`、`validateGenerateOutput` 等与 `packages/ai-core/src/implementations/model/openai.ts` 几乎同构复制。两 Adapter 长期并行演进时容易 drift（例如错误消息、capability skip 行为不一致）。

  **修复建议：** V1.1 可接受现状；Stage 7 前或下一 Adapter 前提取共享 helper（`ai-core` 内部模块或独立 `model-runtime` 包）。非 Stage 6 阻塞项。

- [`packages/model-ollama/scripts/verify-ollama-adapter.mjs`] **Stage 6 §17 验收覆盖不完整**

  脚本已验证：默认 profile、mapper、capability 拒绝、可选 live Ollama（`OLLAMA_VERIFY_MODEL`）。**未覆盖：** primary 失败 → fallback 成功、首 token 后流失败不切模型、工具规划 live 路径。Stage 6 文档 §14.5 场景 B/C 与 §17.4 部分检查项尚无自动化或 Review 证据。

  **修复建议：** 为 `OllamaChatModel` 注入 fake `OllamaClient`（接口已在 `ollama-chat-model.ts:31-34` 定义但未用于测试）；`verify:adapter` 增加 fallback 与 mid-stream 失败用例；Review 归档中记录 live 验证环境（若已手动跑过）。

### 低

- [`packages/model-ollama/package.json:17`] **`verify:adapter` 未串联 `build`**

  脚本 import `../dist/index.js`；若 `dist` 过期，verify 可能测到旧构建。当前 CI/本地若先 build 则无碍。

  **修复建议：** `"verify:adapter": "pnpm build && node scripts/verify-ollama-adapter.mjs"`。

- [`packages/model-ollama/src/ollama-message-mapper.ts:84-96`] **`toolCallId` 未映射到 Ollama tool result**

  Core `ChatMessage.toolCallId` 被丢弃，仅传 `tool_name`。V1.1 单工具轮次通常可工作；多 tool call 同轮时关联可能不稳定。

  **修复建议：** README 注明限制；待 Ollama SDK 支持 call id 时再补映射。

- [`packages/model-ollama/src/ollama-message-mapper.ts:130-132`] / [`ollama-tool-mapper.ts:98-100`] **`isRecord` 重复**

  **修复建议：** 提取到 package 内 `utils.ts` 或单文件共享（非阻塞）。

- [`AGENTS.md`](../../../AGENTS.md) / [`docs/ai/core/project-context.md`](../../../docs/ai/core/project-context.md) **尚未登记 `model-ollama`**

  Stage 6 文档将完整文档更新放在 Stage 8；package 已进 monorepo turbo 范围。建议在 Stage 6 Review 归档中注明「文档同步留 Stage 8」，避免误以为遗漏。

---

## 架构关注项

- [`packages/model-ollama/package.json:20-22`] **CLEAR** — 依赖方向正确：`ai-core` + `ollama`，无 Demo/React/DB；`ai-core` 未引入 `ollama`。

- [`packages/model-ollama/src/ollama-chat-model.ts:36-160`] **CLEAR** — `ChatModel` 契约完整：`meta.id === "model.ollama"`、默认 capability、stream 自动 merge `streaming: true`、可见文本后禁止 fallback，符合 Stage 6 §9.4 与 Stage 5 Workflow 预期。

- [`packages/model-ollama/src/ollama-tool-mapper.ts:15-57`] **CLEAR** — AI SDK dynamic ToolSet → Ollama `Tool[]` 单点映射，符合修订后的 Stage 6 §8.3。

- [`packages/model-ollama/src/ollama-chat-model.ts:400-404`] **WATCH** — `tools` 非空时自动要求 `toolCalling: true`，比 OpenAI Adapter 更严格（OpenAI 仅透传 tools）。行为合理且有利于 capability 筛选，但应在 README 说明「传 tools 即视为需要 toolCalling 能力」。

- **Stage 7 边界** **CLEAR** — 未修改 Demo `model-factory` / UI，符合 Stage 6 范围。

---

## 合成说明

- code-reviewer：**COMMENT**（实现质量良好，0 个高/严重问题；中等问题集中在导出面、验证覆盖、重复代码）
- 架构状态：**WATCH**（边界 CLEAR，维护性与验收证据需补强）
- 最终结论：**建议**（依据 OMX：architect = WATCH → 建议）

---

## 检查项

### 安全

- [x] Adapter 不读 `process.env`；verify 脚本可选 env 仅用于 live 测试
- [x] 错误消息截断（`MAX_ERROR_MESSAGE_LENGTH = 240`）
- [x] 无硬编码密钥

### 代码质量

- [x] mapper 职责分离（message / tool / options / chat-model）
- [ ] runtime 与 OpenAI Adapter 重复（中）
- [x] 默认 `maxRetries: 0`、`retryDelayMs: 300` 与文档一致

### 性能

- [x] Ollama client 构造时创建，非每请求重建
- [x] retry 退避仅在同候选重试间 sleep

### 项目规范

- [x] `pnpm typecheck`：6 Tasks successful
- [x] `pnpm lint`：6 Tasks successful
- [x] `@ying-companion/model-ollama` build + verify:adapter 通过
- [ ] Stage 6 全量人工验收清单未完全归档（中）

### 架构

- [x] 独立 package，ai-core 无 Ollama 分支
- [x] Workflow 不依赖 provider 名称
- [x] Embedding 未混入 Adapter

### 验证

- [x] `pnpm --filter @ying-companion/model-ollama typecheck`
- [x] `pnpm --filter @ying-companion/model-ollama lint`
- [x] `pnpm --filter @ying-companion/model-ollama build`
- [x] `pnpm --filter @ying-companion/model-ollama verify:adapter`（离线路径）
- [ ] live Ollama + fallback + 流中途失败（待补证据或 fake client）

---

## 备注

**已执行命令：**

```bash
pnpm typecheck          # 6 Tasks successful
pnpm lint               # 6 Tasks successful
pnpm --filter @ying-companion/model-ollama build
pnpm --filter @ying-companion/model-ollama verify:adapter
```

**未审查范围：** Demo Stage 7 集成、Ollama live 端到端（无 `OLLAMA_VERIFY_MODEL` 时未跑 live 分支）。

**合并建议：** Adapter 实现可合并；Stage 6 **签收**前建议补 fallback / 流失败验证记录，并收敛 `index.ts` 公开导出。
