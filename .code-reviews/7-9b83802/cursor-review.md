# 代码审查 — refactor(memory): 收口 Postgres 连接池生命周期

**日期：** 2026-06-17
**审查工具：** Cursor
**模型：** Composer
**审查范围：** 最新 commit `9b838026c5601f0b9b3b748bfc240ff10066d581`
**引用：** `git show 9b83802 --no-color`（9 文件，+224 / -19 行）
**结论：** 建议

## 依据规范

- [AGENTS.md](../../AGENTS.md)
- [docs/ai/core/principles.md](../../docs/ai/core/principles.md)
- [docs/ai/core/working-agreements.md](../../docs/ai/core/working-agreements.md)
- [docs/ai/core/verification.md](../../docs/ai/core/verification.md)
- [docs/ai/core/project-context.md](../../docs/ai/core/project-context.md)
- [.cursor/rules/ai-guide.mdc](../../.cursor/rules/ai-guide.mdc)
- [.cursor/rules/project-context.mdc](../../.cursor/rules/project-context.mdc)
- [apps/model-runtime-demo/README.md](../../apps/model-runtime-demo/README.md)
- [.requirements/stages/stage-04/04-memory-system-patch-2.md](../../.requirements/stages/stage-04/04-memory-system-patch-2.md)
- [eslint.config.mjs](../../eslint.config.mjs)
- [prettier.config.mjs](../../prettier.config.mjs)

## 摘要

本 commit 落地 stage-04 patch-2：将 `PostgresMemoryProvider` 改为仅接收调用方传入的 `pg.Pool`，`dispose()` 变为 no-op；Demo 在 `memory-config.ts` 中创建并持有 Pool，env key 变化时 `pool.end()`；新增 `packages/memory-postgres/README.md`，并同步更新主文档 / patch-0 示例与 `.env.example`。

实现与 patch-2 规格高度一致：`ai-core` 仍无 `pg` 依赖，连接生命周期归宿主，health / 严格 fallback 行为未改。本地已执行 `pnpm turbo run typecheck lint --filter @ying-companion/memory-postgres --filter @ying-companion/model-runtime-demo`，全部通过。

无阻塞缺陷；存在少量文档示例不完整与 Demo 进程退出时未主动 `pool.end()` 的可维护性关注点。

> **备注：** OMX 双车道子代理（`code-reviewer` / `architect`）在本会话内由审查者按 OMX 模板人工完成双车道分析。

## 审查统计

- 审查文件数：9
- 问题总数：4（严重 0 / 高 0 / 中 1 / 低 3）
- code-reviewer 建议：COMMENT
- 架构状态：WATCH

## 问题清单

### 严重

无。

### 高

无。

### 中

- [`.requirements/stages/stage-04/04-memory-system-patch-0.md:252-256`] [规范: `.requirements/stages/stage-04/04-memory-system-patch-2.md` §12] §5.2 代码示例已改为 `new Pool()` + `pool` 注入，但紧接的「重点」仍写「连接 PostgreSQL → memory-postgres」，与 patch-2「连接由调用方创建」不一致，易误导后续集成者。

  **修复建议：** 将「重点」改为：

  ```txt
  读取 env → Demo 应用
  创建 PostgreSQL Pool → Demo 应用（调用方）
  传入 Pool → PostgresMemoryProvider（memory-postgres 适配器）
  调用 MemoryProvider → ai-core workflow
  ```

  并在 §5.2 代码块顶部补 `import { Pool } from "pg";`。

### 低

- [`apps/model-runtime-demo/app/lib/memory-config.ts:95-98`] Demo 以模块级单例持有 `postgresRuntime`，进程正常退出或 dev server 停止时未注册 `pool.end()`。当前 dev 场景可接受，但未来 `apps/api` 应在应用 shutdown hook 中关闭 Pool。

  **修复建议：** 本 patch 可不改；在 `memory-postgres/README.md` 或 demo README 加一句「生产/长期进程应在 shutdown 时 `await pool.end()`」即可。

- [`.requirements/stages/stage-04/04-memory-system.md:216-224`] 主文档示例已改为 Pool 注入，但同样缺少 `import { Pool } from "pg"`，复制粘贴无法直接编译。

  **修复建议：** 示例块增加 import，或注明「示意，省略 import」。

- [`apps/model-runtime-demo/package.json:17`] Demo 新增直接依赖 `pg`（与 `memory-postgres` 内 `pg` 并存）。这是**正确边界**（调用方需能 `new Pool()`），属预期重复，无需删除；仅需知悉 lockfile 会解析两份同版本 `pg`。

## 架构关注项

- [`packages/memory-postgres/src/postgres-memory-provider.ts:19-23`] **CLEAR（正向）** — `pool` 必填、`connectionString` / `ownsPool` 已移除；`import type { Pool }` 避免适配器包在运行时隐式建连，边界清晰。

- [`apps/model-runtime-demo/app/lib/memory-config.ts:145-173`] **WATCH** — key 变化时 `pool.end()` 再重建的模式正确，但 `resolvePostgresRuntime` 为 async 且无锁：并发请求在「旧 pool 已 end、新 runtime 未赋值」窗口可能短暂拿到已关闭的 pool。patch-0 起即存在，dev 热重载下概率低；正式 API 应用启动期单例初始化或加互斥。

- [`packages/memory-postgres/README.md`] **CLEAR** — 本地 DB 路径、migration、Pool 注入示例、dispose no-op 说明齐全，满足 patch-2 §7.4 文档落点。

## 合成说明

- code-reviewer：**COMMENT** — 实现正确、验证通过；文档「重点」与 import 示例有小缺口。
- 架构状态：**WATCH** — 连接责任收口符合 V1 原则；仅记录 Demo 单例 Pool 的并发切换与 shutdown 惯例。
- 最终结论：**建议**（依据 OMX：architect = WATCH）

## patch-2 验收对照（§14.2 摘要）

| 项                                                     | 状态                                      |
| ------------------------------------------------------ | ----------------------------------------- |
| `PostgresMemoryProviderOptions.pool` 必填              | ✅                                        |
| 不再内部 `new Pool` / `ownsPool`                       | ✅                                        |
| `dispose()` no-op                                      | ✅                                        |
| Demo 创建 Pool、`pool.end()` 替换 `provider.dispose()` | ✅                                        |
| `packages/memory-postgres/README.md`                   | ✅                                        |
| demo README / `.env.example` 更新                      | ✅                                        |
| 主文档 + patch-0 示例更新                              | ⚠️ 示例已改，§5.2「重点」与 import 待补   |
| §11 五月天 save/recall 实机验证                        | 未在本审查环境执行（需本地 DB + API Key） |

## 检查项

### 安全

- [x] 无硬编码密钥；`.env.example` 仅为占位
- [x] SQL 使用参数化查询；`tableName` 有标识符校验
- [x] 鉴权：本 patch 范围外

### 代码质量

- [x] 改动聚焦、diff 小
- [x] 命名与 patch-0 注释风格一致

### 性能

- [x] 仍按 key 复用单 Pool，无每请求建连回归

### 项目规范

- [x] `ai-core` 无 `pg` 依赖
- [x] ESLint / TypeScript 通过

### 架构

- [x] 调用方拥有 Pool 生命周期，适配器只执行 SQL
- [x] 状态 WATCH（shutdown / 并发切换惯例）

### 验证

- [x] `pnpm turbo run typecheck lint --filter @ying-companion/memory-postgres --filter @ying-companion/model-runtime-demo` — 6 tasks 全部成功
- [ ] patch-2 §11 端到端（health / 五月天 save-recall / DB 异常）— 审查者未连真实 PostgreSQL

## 备注

- 审查范围仅为 commit `9b83802`；未审查工作区其他历史 commit。
- 若需对 §11 实机路径做 follow-up，可在本地 DB 就绪后使用 `code-review-followup` 技能补验证记录。
- 建议合并前顺手修正 patch-0 §5.2「重点」与文档 import（约 5 行，非阻塞）。
