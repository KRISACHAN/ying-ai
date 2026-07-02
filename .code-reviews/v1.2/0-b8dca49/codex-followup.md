# 代码审查复核 — V1.2 Stage 01 Web Search Tool

**日期：** 2026-07-02
**审查工具：** Codex
**模型：** GPT-5
**审查范围：** `.code-reviews/v1.2/0-b8dca49/cursor-review.md` 及当前实现
**引用：** `.code-reviews/v1.2/0-b8dca49/cursor-review.md`
**结论：** 建议

## 依据规范

- `AGENTS.md`
- `docs/ai/core/principles.md`
- `docs/ai/core/working-agreements.md`
- `docs/ai/core/verification.md`
- `docs/ai/core/project-context.md`
- `.requirements/prompts/02-execution.md`
- `.requirements/prompts/05-v1.2-plan.md`
- `.requirements/stages/v1.2/stage-01/01-web-search-tool.md`
- `.codex/skills/code-review-followup/SKILL.md`
- `packages/tool-web-search/README.md`
- `apps/model-runtime-demo/README.md`

## 摘要

Cursor 的 5 条发现中，3 条已采纳并在本轮做了局部修复，1 条经核对当前模型适配器与 Planning Provider 行为后判定不成立，1 条作为非阻塞架构关注保留。修复范围集中在 `tool-web-search`：规范化 Tavily `publishedAt`、给无结果失败结果补充 `metadata.empty`、并澄清 disabled 错误码由宿主门控承担。当前目标验证均已通过；真实 Tavily 联调和端到端人工验收未在本轮执行。

## 审查统计

- 复核问题数：5
- 已采纳并修复：3
- 不成立：1
- 保留关注：1
- 未处理：0
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

- [`packages/tool-web-search/src/implementations/tavily-web-search-client.ts`] Cursor 关于 `publishedAt` 未校验 ISO 格式的发现成立。已新增 `normalizePublishedAt()`，对 Tavily 的 `published_date` / `publishedDate` 使用 `Date.parse` 校验并输出 ISO 字符串，无效日期省略该字段；合约脚本增加 bad-date source 覆盖。
- [`packages/tool-web-search/src/tool/create-web-search-tool.ts`] Cursor 关于无结果与 Provider 失败难以区分的建议已采纳。无结果仍按既有契约返回 `ok: false` 与 `WEB_SEARCH_NO_RESULTS`，同时在 metadata 中增加 `empty: true`，供后续 UI 或调试分支判断。
- [`packages/tool-web-search/README.md`] Cursor 关于 `WEB_SEARCH_DISABLED` 易误导的发现已通过文档澄清处理。Stage 01 的设计是关闭时完全不注册 Tool，因此 disabled 状态由宿主门控承担，不应产生 disabled Tool 调用；README 已补充该约束。

### 不成立

- [`apps/model-runtime-demo/app/lib/web-search-runtime.ts`] Cursor 认为 `supportsToolCalling()` 使用 primary/fallback OR 可能偏宽。复核后判定该发现对当前实现不成立：`DefaultToolPlanningProvider.plan()` 调用模型时显式要求 `requiredCapabilities: { toolCalling: true }`，OpenAI-compatible 与 Ollama adapter 的执行计划都会用 `modelProfileSatisfiesCapabilities()` 过滤 primary/fallback profile。宿主 OR 的含义是“本轮模型链中存在可承担 planning 的候选 profile”，实际 planning 时仍会落到满足能力要求的 candidate；若 profile 配置本身误报能力，属于模型配置真实性问题，不应通过只看 primary profile 解决。

### 保留关注

- [`packages/ai-core/src/implementations/memory/model-memory-extractor.ts`] Cursor 关于 Memory 隔离仍依赖 prompt 的担忧成立，但本阶段不作为阻塞项。当前实现已按 Stage 01 约束在成功 ToolResult metadata 写入 `externalContext` 与 `memoryPolicy`，Extractor 也以通用 metadata 推导外部上下文并注入 system prompt；没有在 `ai-core` 写 `web_search` 专用分支。若后续验收发现模型仍把搜索事实写入长期记忆，再引入 assistant 文本裁剪或双通道抽取。

### 未处理

无。

## 验证

- `./node_modules/.bin/prettier --write packages/tool-web-search/scripts/verify-web-search-contract.mjs packages/tool-web-search/src/implementations/tavily-web-search-client.ts packages/tool-web-search/src/tool/create-web-search-tool.ts packages/tool-web-search/README.md`：通过
- `CI=true pnpm --filter @ying-companion/tool-web-search verify:web-search-contract`：通过
- `CI=true pnpm --filter @ying-companion/tool-web-search typecheck`：通过
- `CI=true pnpm --filter @ying-companion/tool-web-search lint`：通过
- `CI=true pnpm --filter @ying-companion/model-runtime-demo typecheck`：通过
- 真实 Tavily 搜索与端到端人工验收：未运行，本轮只覆盖 Cursor 复核与局部契约验证

## 合成说明

- code-reviewer：COMMENT
- 架构状态：WATCH
- 最终结论：**建议**。Cursor 的可修复问题已收敛，剩余 Memory 文本级隔离属于后续可按验收结果加强的非阻塞关注项。
