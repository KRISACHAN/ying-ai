# 代码审查复核 — V1.2 Stage 01 Web Search Tool

**日期：** 2026-07-05  
**审查工具：** Cursor  
**模型：** Composer  
**审查范围：** `8df7ba4` 及当前工作区实现  
**引用：** `.code-reviews/v1.2/0-8df7ba4/cursor-review.md`  
**结论：** 建议

## 依据规范

- [AGENTS.md](../../../AGENTS.md)
- [docs/ai/core/verification.md](../../../docs/ai/core/verification.md)
- [.requirements/stages/v1.2/stage-01/01-web-search-tool.md](../../../.requirements/stages/v1.2/stage-01/01-web-search-tool.md)
- 当前实现：`packages/tool-web-search/`、`packages/tool-web-search-tavily/`、`apps/model-runtime-demo/`

## 摘要

对照 `cursor-review.md` 逐条复核当前代码（HEAD `8df7ba4`）。原审查结论成立：Stage 01 主链路与 spec 对齐，无 CRITICAL/HIGH 阻塞项。6 条可执行发现均未在本轮修复（按用户要求仅出复核文档），其中 2 条中等问题与 4 条低等问题均确认为有效但非阻塞的保留关注；架构 WATCH 项（包边界、capabilities 合并、fallback 成本）维持观察即可。原报告「建议合并、跟踪 WATCH」的判断维持不变。

## 审查统计

- 复核问题数：6
- 已采纳并修复：0
- 不成立：0
- 保留关注：6
- 未处理：0
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 复核结论

### 已采纳并修复

无。（本轮按要求不写代码，仅复核。）

### 不成立

无。

### 保留关注

- [`apps/model-runtime-demo/migrations/0003_add_web_search_settings.sql`] **DB 列 `web_search_enabled` 仍无运行时消费者**

  复核：`rg web_search_enabled` 仅命中迁移 SQL 与本 review 文档，无 TS/TSX 读写。实际开关由 env `WEB_SEARCH_ENABLED` 经 `resolveWebSearchAvailability()` 控制。结论与原审查一致，属 schema/运行时双轨。

  建议：Stage 2 若不做 per-conversation 开关，在 spec/README 标注「预留列」或拆迁移；若要做，在 `DebugRepository` 接线并写明 env 优先级。

- [`apps/model-runtime-demo/app/conversation-workspace.tsx:103-115`] **modelConfig 变更会重置 Web Search 可用性状态**

  复核：`useEffect` 在 `modelConfig` 变化时，若 `toolCalling !== true` 则强制 `{ reason: "tool_calling_unsupported" }`；否则 `setWebSearchAvailability(initialWebSearchAvailability)`，会覆盖 `workflow:finish` 刚写入的运行时状态（L225–228）。`displayedWebSearchAvailability`（L72–83）对 `toolCalling=false` 有展示层兜底，但无法防止 `toolCalling=true` 时 state 被 SSR 初值覆盖。

  建议：仅在 `toolCalling` 从 true→false 时降级；或在客户端用 env 等价逻辑重算 availability，而非无条件回写 `initialWebSearchAvailability`。

- [`packages/tool-web-search-tavily/src/tavily-web-search-provider.ts:100-103`] **Fallback 完全替换 primary sources**

  复核：fallback 触发后 `sources: fallback.result.sources`（L103），primary 结果被丢弃；`usage`/`responseTimeMs` 有合并。属有意策略，与 spec §5.3「最多 2 次调用 + poor 时 fallback」一致，但信息丢失风险存在。

  建议：在 adapter README 或运维说明中写明；后续可考虑 merge + URL dedupe。

- [`packages/tool-web-search/src/format-web-search-for-model.ts:3-22`] **`usageInstructions` 日期使用运行时本地时区**

  复核：`buildUsageInstructions()` 用 `new Date()` + `getFullYear()/getMonth()/getDate()`（本地日历日）；`companion-runtime.ts` / `api/chat/route.ts` 的 `get_current_time` 固定 `Asia/Shanghai`。跨时区部署时「Today is YYYY-MM-DD」可能与 Demo 其它工具不一致。

  建议：注入 `timeZone` 或复用 Demo 常量时区（与 `get_current_time` 对齐）。

- [`apps/model-runtime-demo/scripts/verify-web-search-workflow.mjs`] **阶段门禁依赖真实 Key（by design）**

  复核：脚本 L51–62 对 `TAVILY_API_KEY`、`WEB_SEARCH_ENABLED=true`、`OPENAI_MODEL_SUPPORTS_TOOL_CALLING=true` fail fast；与 spec §11「不考虑 CI、本地 .env 门禁」一致。非缺陷，属可接受风险。

  建议：合并/release 前由维护者在本地执行两脚本并记录证据。

- [`.requirements/stages/v1.2/stage-01/01-web-search-tool.md`] **spec 字面范围与 Debug UI 扩展**

  复核：§29 写「不重写 ConversationWorkspace」，实现增加了 availability 标签与 RunDebugPanel Web Search Log；§9、§10.3 已写入 Web Search Log，但 §13 交付物未显式列出「Debug 可用性标签 / Web Search Log Panel」。功能属可观测性范畴，与 spec 精神一致，文档仍有小缺口。

  建议：§13 交付物补一行 Debug 可观测 UI，避免后续 stage 误判 scope creep。

### 未处理

无。（上述项均已在原审查中标注为非阻塞，本轮确认保留。）

## 架构关注复核

| 项                                                       | 复核结果                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| core / adapter / host 包边界                             | **维持 CLEAR** — core 不读 env、Host 工厂注入、`serverExternalPackages` 已配置 |
| `mergeDebugModelConfigWithEnvDefaults` capabilities 合并 | **维持 WATCH** — 为 toolCalling 稳定性关键路径；Stage 2 UI toggle 需定义优先级 |
| 质量驱动二次 Tavily 调用                                 | **维持 WATCH** — CJK poor→fallback 为特性；latency/credits 需在运维文档注明    |
| 迁移混入 workflow run 唯一索引                           | **维持 WATCH** — 与 web search 无关，建议未来按主题拆分迁移                    |

## 验证

- `pnpm --filter @ying-companion/tool-web-search typecheck`：通过
- `pnpm --filter @ying-companion/tool-web-search-tavily typecheck`：通过
- `pnpm --filter @ying-companion/model-runtime-demo typecheck`：通过
- `pnpm --filter @ying-companion/tool-web-search-tavily test`：14/14 通过
- `pnpm --filter @ying-companion/tool-web-search-tavily verify:web-search-contract`：未运行（需 `TAVILY_API_KEY`）
- `pnpm --filter @ying-companion/model-runtime-demo verify:web-search-workflow`：未运行（需完整 `.env` + 支持 toolCalling 的模型）

## 合成说明

- code-reviewer：COMMENT（原 6 条发现经验证均成立，但均属非阻塞；Stage 01 验收路径与 spec 一致）
- 架构状态：WATCH（DB 死列、availability 状态机、fallback 策略与成本）
- 最终结论：**建议**。可合并 Stage 01 实现；合并前建议本地跑通两 verify 脚本，并将 WATCH 项记入 Stage 2 backlog（DB 接线、availability 状态机、时区统一、§13 交付物补全）。
