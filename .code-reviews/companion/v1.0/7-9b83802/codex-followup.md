# Cursor Review Follow-up — refactor(memory): 收口 Postgres 连接池生命周期

**Date:** 2026-06-17
**Review Tool:** Codex
**Review Scope:** `.code-reviews/7-9b83802/cursor-review.md` and current implementation
**Reference:** `.code-reviews/7-9b83802/cursor-review.md`
**Verdict:** Advisory

## Follow-Up Conclusions

### Accepted and Fixed

#### `.requirements/stages/stage-04/04-memory-system-patch-0.md:252-256` — §5.2「重点」仍沿用旧表述

已修复。

处理：

- 在 §5.2 示例顶部补 `import { Pool } from "pg";`；
- 将「重点」改为调用方创建 PostgreSQL Pool、再传入 `PostgresMemoryProvider`。

回复：

```txt
已接受并修复。§5.2 的「重点」已改成调用方创建 Pool 的边界表述：
读取 env → Demo 应用；创建 PostgreSQL Pool → Demo 应用（调用方）；
传入 Pool → PostgresMemoryProvider；调用 MemoryProvider → ai-core workflow。
示例顶部也已补 `import { Pool } from "pg";`。
```

#### `.requirements/stages/stage-04/04-memory-system.md:216-224` — Pool 示例缺少 import

已修复。

处理：

- 在主文档 Pool 注入示例顶部补 `import { Pool } from "pg";`。

回复：

```txt
已接受并修复。主文档的 Pool 注入示例已补 `import { Pool } from "pg";`，
复制示例时不会再缺少 Pool 来源。
```

### Not Valid

#### `apps/model-runtime-demo/package.json:17` — Demo 直接依赖 `pg`

Cursor 结论成立：这是预期设计，不需要修复。

回复：

```txt
已确认。Demo 作为调用方需要直接 `new Pool()`，因此显式依赖 `pg` 是正确边界；
`packages/memory-postgres` 也依赖 `pg` 是适配器自身类型/运行所需。当前 lockfile 解析到
同版本 `pg`，无需删除。
```

### Retained Concern

#### `apps/model-runtime-demo/app/lib/memory-config.ts:95-98` — 进程退出时未统一关闭 Pool

该关注项有效，但不阻塞当前 patch。

理由：

- 当前 demo 是 Next.js 开发调试应用，已有 env key 变化时 `pool.end()` 的释放路径；
- 进程退出 shutdown hook 在 Next dev/serverless 场景下语义不稳定；
- patch-2 的硬性目标是连接责任收口，不要求实现长期进程生命周期管理。

回复：

```txt
接受作为 WATCH 项。当前 patch 已把 env key 变化时的连接池释放改为调用方 `pool.end()`；
进程退出时的统一 shutdown hook 暂不在 demo 中实现。后续如果把该模式迁移到
`apps/api` 或长期运行服务，应在应用生命周期层统一关闭 Pool。
```

#### `apps/model-runtime-demo/app/lib/memory-config.ts:145-173` — 并发切换 runtime 的短窗口

该关注项有效，但不阻塞当前 patch。

理由：

- 该风险只出现在同一进程内 env key 变化与请求并发交错时；
- demo 的 env 通常在启动前固定，生产 API 应使用启动期初始化或互斥保护；
- 当前改动没有扩大该风险，只把释放动作从 `provider.dispose()` 改为调用方 `pool.end()`。

回复：

```txt
接受作为架构 WATCH 项。当前 demo 沿用进程级 runtime 复用策略，patch-2 仅调整 Pool
所有权和释放责任。正式 API 接入时应避免请求热路径重建 runtime，改为启动期初始化或加互斥。
```

### Unaddressed

无。

## Additional Verification

Cursor review 中提到 patch-2 §11 端到端未在审查环境执行。后续本地已补充验证：

```txt
PostgreSQL 17.4 可连接
pgvector 0.8.2 已安装
ying_companion_dev 已创建
companion_memories 表已创建
embedding 字段为 vector(1536)
GET /api/memory-health 返回 status=connected
PostgresMemoryProvider 对真实本地库 save/recall smoke 通过
smoke 测试数据已清理
```

## Suggested Reply Summary

```txt
感谢 review。实现层面的 Pool 所有权收口已经符合 patch-2：provider 不再创建或关闭连接，
Demo 作为调用方创建 Pool，并在 runtime key 变化时 `pool.end()`。

两个文档小修建议已处理：patch-0 §5.2「重点」已改成调用方创建 Pool 的表述；
stage-04 主文档 Pool 示例已补 `import { Pool } from "pg";`。

Demo shutdown hook 与并发切换 runtime 作为 WATCH 项保留，不阻塞当前 patch；
正式 API 接入时应在应用生命周期层统一初始化和关闭 Pool。

Demo 直接依赖 `pg` 是预期边界，因为调用方需要创建 `pg.Pool`，无需删除。
```
