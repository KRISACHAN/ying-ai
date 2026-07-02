# 代码审查 — V1.2 Stage 01 Web Search Tool（commit b8dca49）

**日期：** 2026-07-02  
**审查工具：** Cursor  
**模型：** Composer  
**审查范围：** 用户指定 commit `b8dca49`（HEAD，`feat(web-search): 接入可配置网页搜索工具`）  
**引用：** `git show b8dca49`  
**结论：** 建议

## 依据规范

- [AGENTS.md](../../../AGENTS.md)
- [docs/ai/core/principles.md](../../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../../docs/ai/core/project-context.md)
- [.requirements/stages/v1.2/stage-01/01-web-search-tool.md](../../../.requirements/stages/v1.2/stage-01/01-web-search-tool.md)
- [packages/tool-web-search/README.md](../../../packages/tool-web-search/README.md)
- [apps/model-runtime-demo/README.md](../../../apps/model-runtime-demo/README.md)

## 摘要

本次提交完整落地 V1.2 Stage 01 的主线：`packages/tool-web-search` 新包、Tavily 适配、对话级 `webSearchEnabled`、宿主条件注册、Memory 通用 metadata 隔离、以及 `verify:web-search-contract` 契约脚本。整体与 stage 文档边界一致——`ai-core` 无 `web_search` 硬编码分支，错误码走 `ToolResult.metadata`，成功 Result 同步写入 `externalContext` / `memoryPolicy`。

已执行验证：`verify:web-search-contract`、相关 package 的 typecheck / lint 均通过。未发现密钥泄漏或 Workflow 专用搜索分支等阻塞项；剩余问题集中在 toolCalling 判定粒度与 Memory 隔离深度，属非阻塞 WATCH。

## 审查统计

- 审查文件数：27（commit 变更）
- 问题总数：5（严重 0 / 高 0 / 中 2 / 低 3）
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`apps/model-runtime-demo/app/lib/web-search-runtime.ts:66-70`] **toolCalling 判定偏宽**

  `supportsToolCalling()` 在 primary **或** fallback 任一 profile 声明 `toolCalling: true` 时即注册 `web_search`。stage 文档要求的是「实际执行 Tool Planning 的模型」支持 toolCalling。若 primary profile 标 true 但运行时实际走无 tool 能力路径，Runtime 可能显示 `enabled`，Planner 却降级为 `no_tool`，Debug 状态与真实行为不完全一致。

  **修复建议：** 优先按「本轮实际用于 planning 的 profile / runtime.usedModel」判定；至少将 `model_unsupported` 与 planner 降级原因在 Debug metadata 中对齐展示。

- [`packages/ai-core/src/implementations/memory/model-memory-extractor.ts:138-164`] **Memory 隔离仍主要依赖 prompt**

  `deriveMemoryExternalContext()` 与 extractor system prompt 已正确接入通用 metadata，但 `assistantMessage` 仍是完整最终回复，其中可能含搜索合成事实。stage 文档的「不把 web_search 结果作为 Extractor 候选来源」在工程上尚未做到文本级剥离，长期 Memory 误写入仍依赖 LLM 自觉。

  **修复建议：** V1.2 可接受当前方案；若需更强保证，后续可对含 `externalContextUsed` 的轮次做 assistant 文本裁剪或双通道抽取。本阶段在 Debug/验收中增加「搜索事实不进 Memory」的手工用例即可。

### 低

- [`packages/tool-web-search/src/implementations/tavily-web-search-client.ts:196-207`] **publishedAt 未校验 ISO 格式**

  stage 契约要求 `publishedAt` 为 ISO 字符串，实现直接透传 Tavily 返回值，异常格式可能进入 Tool Result / 后续 UI。

  **修复建议：** 规范化时尝试 `Date.parse` 或 `new Date()` 校验，无效则省略该字段。

- [`packages/tool-web-search/src/errors/web-search-error.ts:2`] **`WEB_SEARCH_DISABLED` 未使用**

  与 stage 设计一致（关闭时不注册 Tool），但错误码枚举中存在未使用项，契约脚本也未覆盖。

  **修复建议：** README 注明「disabled 由宿主门控承担，不产生 Tool 调用」；或从枚举中移除以免误导。

- [`packages/tool-web-search/src/tool/create-web-search-tool.ts:105-110`] **无结果返回 `ok: false`**

  符合「稳定 domain code」要求，workflow 会以 degraded 继续 Final Response，行为合理。若希望区分「搜索成功但空结果」与「Provider 失败」，可在 metadata 增加 `empty: true` 供 UI 分支（非必须）。

## 架构关注项

- **CLEAR（边界）** — `packages/tool-web-search` 不读 env；宿主 `web-search-runtime.ts` 负责门控；`ai-core` 仅扩展 `MemoryExtractionInput` 与通用 metadata 扫描，无 Tavily / web_search 名称分支。✅
- **CLEAR（ToolResult 契约）** — `createWebSearchTool` 在成功/失败时均写入 `metadata.domain` / `metadata.code` / `externalContext` / `memoryPolicy`，与 stage §3.2 / §7 一致。✅
- **CLEAR（持久化）** — `0003` 对话开关、`0004` UNIQUE index、sources 走既有 `tool_snapshot_json`，未重复造列。✅
- **WATCH** — `supportsToolCalling` 的 OR 语义与 stage「实际规划模型」表述存在轻微偏差（见上）。
- **WATCH** — Memory 隔离为 prompt + metadata 层，非结构化文本级隔离（见上）。

## 合成说明

- code-reviewer：COMMENT（无 CRITICAL/HIGH；实现质量良好，契约脚本与 lint/typecheck 已通过）
- 架构状态：WATCH（两处非阻塞设计余量）
- 最终结论：**建议** — 可合并继续 Stage 02；WATCH 项可在 follow-up 或阶段 2 前按需收紧

## 检查项

### 安全

- [x] API Key 仅宿主读取，经构造函数注入 Tavily Client
- [x] Tool Result 不含原始 Provider response / stack
- [x] URL 仅允许 http/https，过滤 `javascript:` 等（契约脚本已测）
- [x] usageInstructions 含间接指令防护

### 代码质量

- [x] 包边界清晰，Tool Factory 参数校验完整
- [x] 错误映射稳定，重试策略符合 stage（401/403 不重试）
- [ ] `publishedAt` ISO 校验（低优先级）

### 性能

- [x] 结果上限 5、snippet 截断 500 字符
- [x] 超时 + 有限重试，无 unbounded loop

### 项目规范

- [x] 符合 V1 边界（ai-core 不读 env、不直连 DB）
- [x] stage 01 关键验收点：双层门控、条件注册、metadata 错误码、Memory metadata
- [x] ESLint / TypeScript 通过

### 架构

- [x] 无 Workflow 专用搜索分支
- [x] 来源复用 `tool_snapshot_json`
- [ ] toolCalling 注册判定可更贴近 runtime（WATCH）

### 验证

- [x] `pnpm --filter @ying-companion/tool-web-search verify:web-search-contract` — passed
- [x] `pnpm --filter @ying-companion/tool-web-search typecheck lint` — passed
- [x] `pnpm --filter @ying-companion/ai-core typecheck lint` — passed
- [x] `pnpm --filter @ying-companion/model-runtime-demo typecheck lint` — passed
- [ ] 未执行真实 Tavily 集成 / 端到端人工验收（stage 允许，建议 Stage 01 收口前补）

## 备注

- 独立 architect subagent 不可用；架构维度由本审查一并覆盖。
- 未审查 stage 02（AI SDK UI / source parts 映射）范围。
- 建议人工验收：默认关闭、开启搜索、Memory 隔离（场景 6）、两轮来源不串（场景 7）。
