# 代码审查 — V1.2 Stage 01 Web Search Tool（HEAD 8df7ba4）

**日期：** 2026-07-05  
**审查工具：** Cursor  
**模型：** Composer  
**审查范围：** HEAD 最新提交（基于上下文 transcript 8ac18c8d 的 stage-01 实现）  
**引用：** `git show 8df7ba46beb2c1bc217dba9ddb5d9ebbd5b1a920`（42 文件，+2509 行）  
**结论：** 建议

## 依据规范

- [AGENTS.md](../../../AGENTS.md)
- [docs/ai/core/principles.md](../../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../../docs/ai/core/project-context.md)
- [.cursor/rules/ai-guide.mdc](../../../.cursor/rules/ai-guide.mdc)
- [.requirements/stages/v1.2/stage-01/01-web-search-tool.md](../../../.requirements/stages/v1.2/stage-01/01-web-search-tool.md)
- [eslint.config.mjs](../../../eslint.config.mjs) · [prettier.config.mjs](../../../prettier.config.mjs)

## 摘要

本次提交完成 V1.2 Stage 01 的 Web Search 全链路：`tool-web-search`（Provider 无关 core）+ `tool-web-search-tavily`（Tavily adapter）+ Demo Host 接入。相较先前审查（c88f484）中「toolCalling 被 UI 丢弃」「Webpack 无法解析 import.meta」「单包耦合 Tavily」等阻塞项，本 commit 已通过 `mergeDebugModelConfigWithEnvDefaults` / `mergeStoredModelConfigWithDefaults`、UI 可用性标签、`serverExternalPackages` 与包拆分予以修复。Core 边界、Tool 路径、metadata 派生方式均符合 stage-01 spec。剩余问题以非阻塞的架构关注与 Demo 层遗留迁移为主，建议在合并前记录 WATCH 项并规划后续清理。

## 审查统计

- 审查文件数：42（重点细读 25 个源文件 / 脚本）
- 问题总数：6（严重 0 / 高 0 / 中 2 / 低 4）
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`apps/model-runtime-demo/migrations/0003_add_web_search_settings.sql:1-2`] **DB 列 `web_search_enabled` 无运行时消费者**

  迁移新增 `debug_conversations.web_search_enabled`，但全仓库无任何 TS/TSX 读取或写入该列；实际开关完全由 env `WEB_SEARCH_ENABLED` 控制。造成 schema 与运行时双轨，后续维护者易误判存在 per-conversation 开关。

  **修复建议：** 若 stage-01 不需要 per-conversation 开关，删除该列或拆出独立迁移并在 README/spec 注明「预留 stage-2」；若需要，在 `DebugRepository` / runtime 中接线并与 env 优先级写清。

- [`apps/model-runtime-demo/app/conversation-workspace.tsx:103-115`] **modelConfig 变更会重置 Web Search 可用性状态**

  `useEffect` 在 `modelConfig` 变化时将 `webSearchAvailability` 重置为 SSR 计算的 `initialWebSearchAvailability`（基于 `defaultModelConfig`），可能覆盖 workflow finish 事件刚写入的运行时状态。用户编辑 model 字段后，Debug 面板标签可能与最近一次 run 的实际 availability 短暂不一致。

  **修复建议：** 仅在 toolCalling 变为 false 时强制降级；否则保留当前 state，或基于 merged capabilities + env 在客户端重算 availability（复用 `readWebSearchAvailability` 逻辑的服务端等价物）。

### 低

- [`packages/tool-web-search-tavily/src/tavily-web-search-provider.ts:100-103`] **Fallback 完全替换 primary sources**

  质量 fallback 触发后只保留 fallback 的 `sources`，丢弃 primary 结果。对「primary 有部分可用源、但整体被判 poor」的场景可能丢失信息。

  **修复建议：** 文档化当前策略；或考虑 merge + dedupe by URL 后再排序。

- [`packages/tool-web-search/src/format-web-search-for-model.ts:3-22`] **`usageInstructions` 日期使用运行时本地时区**

  Demo 其它路径使用 `Asia/Shanghai`（如 `companion-runtime.ts`），此处 `new Date()` 取本地日历日，跨时区部署时「今天」可能与用户预期不一致。

  **修复建议：** 注入 `timeZone` 参数或统一使用 demo 常量时区。

- [`apps/model-runtime-demo/scripts/verify-web-search-workflow.mjs:51-62`] **阶段门禁脚本依赖真实 Key（by design）**

  符合 spec「不考虑 CI、本地 .env 门禁」约定，但仓库 clone 后无法在无 Key 环境验证 stage done。已在 `.env.example` 说明，风险可接受。

- [`.requirements/stages/v1.2/stage-01/01-web-search-tool.md:29`] **spec 写「不重写 ConversationWorkspace」但本 commit 扩展了 Debug UI**

  实际增加了 availability 标签、RunDebugPanel Web Search 日志等。功能上属于可观测性/debug 范畴，与 spec 精神一致，但字面范围略有超出；建议在 spec 交付物列表中显式列入「Debug 可用性标签 / Web Search Log Panel」以免后续 stage 误判 scope creep。

## 架构关注项

- [`packages/tool-web-search/` + `packages/tool-web-search-tavily/`] **WATCH — 包边界清晰，符合 V1 约束**

  Core 不读 env、不依赖 Tavily；Host 工厂注入 Provider；`WebSearchToolModelPayload` 使用 `usageInstructions + search` 与 spec 一致。`next.config.ts` 将 tool 包标记为 `serverExternalPackages`，避免 Next Webpack 解析 CJS dist 中的 HMR 残留（先前 build 失败根因）。

- [`apps/model-runtime-demo/app/lib/model-config.ts:271-392`] **WATCH — capabilities 合并策略是稳定性关键**

  `mergeDebugModelConfigWithEnvDefaults` 与 `mergeStoredModelConfigWithDefaults` 确保客户端 POST 的 `modelConfig` 缺失 capabilities 时回退 env 声明（含 `OPENAI_MODEL_SUPPORTS_TOOL_CALLING`）。这是修复「有时像没开 web search」的核心；架构上 Demo 仍依赖 env + 请求 partial config 的合并语义，stage-2 若引入 UI toggle 需明确优先级。

- [`packages/tool-web-search-tavily/src/tavily-web-search-provider.ts:53-121`] **WATCH — 质量驱动的二次检索**

  `evaluateSearchQuality` → fallback 策略会在 poor 时 doubling Tavily 调用（latency + credits）。对 CJK 查询是特性而非 bug，但应在运维/成本文档中注明。

- [`apps/model-runtime-demo/migrations/0003_add_web_search_settings.sql:4-6`] **WATCH — 同文件混入 workflow run 唯一索引**

  `debug_workflow_runs_assistant_message_unique_idx` 与 web search 无关，建议未来迁移按主题拆分以便 review。

## 合成说明

- code-reviewer：COMMENT（无 CRITICAL/HIGH；stage-01 主路径与 spec 对齐，验证脚本与单测结构合理）
- 架构状态：WATCH（DB 死列、availability 状态机、fallback 成本与 source 替换策略）
- 最终结论：**建议**（依据 OMX 规则：architect = WATCH → 建议；可合并，但应跟踪 WATCH 项）

## 检查项

### 安全

- [x] 无硬编码密钥；TAVILY_API_KEY 仅 Host 读取
- [x] query 长度校验（≤256）；snippet 截断（≤400）
- [x] Provider 错误映射不泄露 raw response
- [x] Tool metadata `memoryPolicy: do_not_store`

### 代码质量

- [x] 包职责分离清晰；normalize / error / strategy 模块化
- [x] TypeScript 类型完整；无 `any`
- [ ] DB migration 与运行时一致（`web_search_enabled` 未接线）

### 性能

- [x] 单次 search 有 timeout（15s）
- [ ] Fallback 可能 doubling API 调用（已知 tradeoff）

### 项目规范

- [x] ai-core 不读 Tavily env
- [x] Tool Planning → Registry → Execute 路径
- [x] ESLint / typecheck 通过

### 架构

- [x] Core / adapter / host 边界明确
- [ ] 死 migration 列；availability 客户端状态机有小瑕疵
- [x] 状态：WATCH（无 BLOCK）

### 验证

- [x] `pnpm --filter @ying-companion/tool-web-search typecheck` — 通过
- [x] `pnpm --filter @ying-companion/tool-web-search-tavily typecheck` — 通过
- [x] `pnpm --filter @ying-companion/model-runtime-demo typecheck` — 通过
- [x] `pnpm --filter @ying-companion/tool-web-search-tavily test` — 14/14 通过
- [x] `pnpm --filter @ying-companion/tool-web-search lint` — 通过
- [x] `pnpm --filter @ying-companion/tool-web-search-tavily lint` — 通过
- [x] `pnpm --filter @ying-companion/model-runtime-demo lint` — 通过
- [ ] `verify:web-search-contract` / `verify:web-search-workflow` — 未执行（需 `TAVILY_API_KEY` + `WEB_SEARCH_ENABLED=true` + 支持 toolCalling 的模型）

## 备注

- 审查范围：commit `8df7ba4`（working tree clean）。
- 上下文：transcript 8ac18c8d 中先 review/fix stage-01 spec，再实现并修复 c88f484 审查项；本报告针对最终 HEAD。
- OMX dual-lane：Cursor Task 子 agent（code-reviewer / architect）不可用，由主 agent 独立完成双车道审查并合成。
- 合并前建议本地执行：
  ```bash
  pnpm --filter @ying-companion/tool-web-search-tavily verify:web-search-contract
  pnpm --filter @ying-companion/model-runtime-demo verify:web-search-workflow
  ```
