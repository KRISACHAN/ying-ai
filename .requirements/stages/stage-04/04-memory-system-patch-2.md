# 04-memory-system-patch-2.md

## 阶段 4 Patch 2：连接调用方传入的真实数据库

> 本 patch 目标：把 `packages/memory-postgres` 的数据库连接责任进一步收紧为“调用方创建并传入真实数据库实例”，同时补齐 `apps/model-runtime-demo` 从 0 到 1 连接本地 PostgreSQL + pgvector 的完整路径。
> 本 patch 不重新设计长期记忆系统，不重新设计滚动摘要，不改变 `MemoryProvider` 抽象；重点是让真实数据库连接、建库建表、env 示例、health 检查、Demo 联调全部闭环。

---

## 1. 背景说明

阶段 4 主文档已经明确长期记忆系统的核心闭环：

```txt
用户输入
↓
根据用户输入召回相关长期记忆
↓
将长期记忆注入 Prompt
↓
模型生成回复
↓
从本轮对话抽取新的长期记忆
↓
保存长期记忆
↓
后续对话可以再次召回
```

阶段 4 也明确 PostgreSQL + pgvector 只能作为 `MemoryProvider` 的外部实现，不能放进 `packages/ai-core`，并且 `ai-core` 不能读取 env、不能创建数据库连接。当前主文档示例里曾经使用过 `connectionString` 创建 `PostgresMemoryProvider`，但本 patch 要进一步收紧这个边界：数据库连接由调用方创建，再传入 `PostgresMemoryProvider`。

`patch-0` 已经定义了带数据库 Demo 的目标：在 `apps/model-runtime-demo` 中使用 `PostgresMemoryProvider`，连接真实 PostgreSQL，展示真实保存与召回结果，并提供 health 检查与调试面板。

`patch-1` 已经补充了滚动摘要能力，它明确不处理 PostgreSQL 长期记忆、不做 `packages/memory-postgres`、不修改 `PostgresMemoryProvider`。因此本 patch 只处理真实数据库连接与本地数据库初始化，不触碰滚动摘要。

---

## 2. 当前实现基线

当前仓库中已经存在：

```txt
packages/memory-postgres
apps/model-runtime-demo/app/lib/memory-config.ts
apps/model-runtime-demo/app/api/memory-health/route.ts
```

其中 `packages/memory-postgres` 已经是独立包，依赖 `@ying-companion/ai-core` 与 `pg`，没有把数据库能力放进 `ai-core`。

当前 `PostgresMemoryProvider` 的构造参数是：

```ts
export interface PostgresMemoryProviderOptions {
  connectionString: string;
  embeddingProvider: EmbeddingProvider;
  tableName?: string;
  pool?: Pool;
}
```

并且内部逻辑是：

```ts
this.pool = options.pool ?? new Pool({ connectionString: options.connectionString });
this.ownsPool = options.pool === undefined;
```

也就是说，当前实现已经支持传入 `pool`，但仍然要求 `connectionString`，并且在未传 `pool` 时会由 `PostgresMemoryProvider` 自己创建连接池。

当前 `apps/model-runtime-demo/app/lib/memory-config.ts` 已经读取：

```txt
DATABASE_URL
OPENAI_API_KEY
OPENAI_BASE_URL
OPENAI_EMBEDDING_MODEL
MEMORY_POSTGRES_TABLE
```

并在 `resolvePostgresRuntime` 里创建 `OpenAIEmbeddingProvider` 与 `PostgresMemoryProvider`。当前创建方式仍然是传入 `connectionString`。

因此本 patch 不是从零实现 `PostgresMemoryProvider`，而是做三件事：

```txt
1. 把数据库连接创建责任移动到调用方
2. 补齐本地 PostgreSQL + pgvector 从安装到建表的路径
3. 填满 apps/model-runtime-demo/.env.example，让 Demo 能真实连接数据库
```

---

## 3. Patch 定位

`patch-2` 是阶段 4 的真实数据库连接收口 patch。

它不是新的长期记忆能力，也不是新的 Demo 面板能力，而是对 `patch-0` 的数据库连接方式进行落地修正。

当前关系要从：

```txt
apps/model-runtime-demo
  读取 DATABASE_URL
  ↓
PostgresMemoryProvider
  接收 connectionString
  自己创建 Pool
```

调整为：

```txt
apps/model-runtime-demo
  读取 DATABASE_URL
  创建 pg Pool
  管理 Pool 生命周期
  ↓
PostgresMemoryProvider
  接收调用方传入的 Pool
  使用 Pool 执行 SQL
  不隐式读取 env
  不隐式创建连接
```

最终关系：

```txt
apps/model-runtime-demo
  读取 env
  创建 PostgreSQL Pool
  创建 OpenAIEmbeddingProvider
  创建 PostgresMemoryProvider
  注入 createCompanionCore

packages/memory-postgres
  使用调用方传入的 Pool
  实现 MemoryProvider
  执行 save / recall / healthCheck

packages/ai-core
  只知道 MemoryProvider
  不知道 PostgreSQL 存在
```

---

## 4. Patch 目标

完成后，项目应该具备：

```txt
1. 本机可安装 PostgreSQL + pgvector
2. 可创建 ying_companion_dev 数据库
3. 可执行 companion_memories 表 migration
4. apps/model-runtime-demo/.env.example 中有完整数据库配置示例
5. apps/model-runtime-demo 由调用方创建 pg Pool
6. PostgresMemoryProvider 只接收调用方传入的 Pool
7. /api/memory-health 可检测真实数据库状态
8. Demo 页面可完成真实 save / recall
9. 数据库异常不会阻塞聊天主回复
```

---

## 5. Patch 边界

## 5.1 本 patch 要做

1. 调整 `PostgresMemoryProviderOptions`；
2. 移除 `PostgresMemoryProvider` 内部通过 `connectionString` 创建 `Pool` 的路径；
3. 明确 `PostgresMemoryProvider` 不拥有数据库连接生命周期；
4. 在 `apps/model-runtime-demo` 中创建真实 `pg.Pool`；
5. 在 `apps/model-runtime-demo` 中把 `Pool` 传给 `PostgresMemoryProvider`；
6. 保留并验证 `PostgresMemoryProvider.healthCheck()`；
7. 补齐 `apps/model-runtime-demo/.env.example`；
8. 补齐本地 PostgreSQL + pgvector 安装说明；
9. 补齐创建数据库与执行 migration 的说明；
10. 验证 Demo 能真实保存和召回长期记忆。

---

## 5.2 本 patch 不做

1. 不修改 `MemoryProvider` 抽象；
2. 不重新设计 `MemoryExtractor`；
3. 不重新设计滚动摘要；
4. 不修改 `SummaryProvider`；
5. 不引入 LangChain；
6. 不引入 LangGraph；
7. 不做用户系统；
8. 不做鉴权；
9. 不做商业化；
10. 不做 Docker / docker-compose；
11. 不把 `pg`、`pgvector`、`drizzle` 放入 `packages/ai-core`；
12. 不让 `packages/ai-core` 读取 `DATABASE_URL`；
13. 不让 `packages/ai-core` 创建数据库连接。

---

## 6. 核心原则

## 6.1 数据库连接由调用方拥有

本 patch 后，数据库连接生命周期归调用方。

调用方包括：

```txt
apps/model-runtime-demo
未来业务 API
未来后台服务
未来正式 Web 服务
```

`packages/memory-postgres` 只是适配器，不再拥有连接创建责任。

---

## 6.2 PostgresMemoryProvider 只使用传入连接

当前实现中 `PostgresMemoryProvider` 已经通过 `this.pool.query`、`this.pool.connect` 执行 recall / save / healthCheck。

本 patch 保留这些 SQL 执行逻辑，但构造方式改为只接收调用方传入的 `Pool`：

```ts
export interface PostgresMemoryProviderOptions {
  pool: Pool;
  embeddingProvider: EmbeddingProvider;
  tableName?: string;
}
```

不再允许：

```ts
new PostgresMemoryProvider({
  connectionString,
  embeddingProvider,
});
```

---

## 6.3 Provider 不负责关闭外部连接

当前 `PostgresMemoryProvider` 有 `dispose()`，并且只有 `ownsPool` 为 true 时才 `pool.end()`。

本 patch 后，`PostgresMemoryProvider` 永远不拥有 Pool，因此：

```txt
PostgresMemoryProvider.dispose()
  可以保留
  但应该变成 no-op
  或者仅为兼容旧调用存在

Pool.end()
  由 apps/model-runtime-demo 或未来调用方负责
```

---

## 6.4 ai-core 继续保持纯 SDK

必须继续保证：

```txt
packages/ai-core
  不依赖 pg
  不依赖 drizzle
  不读取 DATABASE_URL
  不创建数据库连接
  不知道 pgvector 存在
```

这个原则不能因为本 patch 引入真实数据库而被破坏。

---

## 7. 设计调整

## 7.1 调整 PostgresMemoryProviderOptions

从当前形式：

```ts
export interface PostgresMemoryProviderOptions {
  connectionString: string;
  embeddingProvider: EmbeddingProvider;
  tableName?: string;
  pool?: Pool;
}
```

调整为：

```ts
export interface PostgresMemoryProviderOptions {
  pool: Pool;
  embeddingProvider: EmbeddingProvider;
  tableName?: string;
}
```

构造函数从：

```ts
this.pool = options.pool ?? new Pool({ connectionString: options.connectionString });
this.ownsPool = options.pool === undefined;
```

调整为：

```ts
this.pool = options.pool;
this.embeddingProvider = options.embeddingProvider;
this.tableName = validateTableName(options.tableName ?? "companion_memories");
```

`ownsPool` 删除或固定为 false。

---

## 7.2 调整 apps/model-runtime-demo 的 memory-config

当前 `memory-config.ts` 读取 env 后，在 `resolvePostgresRuntime` 内直接创建 `PostgresMemoryProvider({ connectionString })`。

本 patch 应调整为：

```ts
const pool = new Pool({
  connectionString: config.connectionString,
});

const embeddingProvider = new OpenAIEmbeddingProvider({
  apiKey: config.apiKey ?? "",
  model: config.embeddingModel,
  ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
});

const provider = new PostgresMemoryProvider({
  pool,
  embeddingProvider,
  tableName: config.tableName,
});
```

`PostgresRuntime` 应该持有：

```ts
interface PostgresRuntime {
  key: string;
  pool: Pool;
  provider: PostgresMemoryProvider;
  embeddingModel: string;
  tableName: string;
}
```

当 env key 改变时，由 `apps/model-runtime-demo` 负责释放旧 pool：

```ts
await postgresRuntime.pool.end();
```

不要再调用 `provider.dispose()` 来释放连接。

---

## 7.3 保持 healthCheck 行为

当前 `healthCheck()` 已经检查：

```txt
SELECT 1
pg_extension 中是否存在 vector
目标表是否存在
```

并返回：

```txt
databaseConnected
pgvectorEnabled
tableReady
ok
error
```

这个行为应该保留。

本 patch 要求 `/api/memory-health` 能基于调用方传入的真实 Pool 检测：

```txt
数据库是否可连接
pgvector 是否启用
companion_memories 表是否存在
```

---

## 8. 本地数据库从 0 到 1

本 patch 要求开发者可以从一台没有项目数据库的机器开始，完成本地数据库准备。

项目不提供 Docker / docker-compose，继续遵守 patch-0 的边界。

---

## 8.1 安装 PostgreSQL 与 pgvector

### macOS 推荐方式

使用 Homebrew：

```bash
brew install postgresql@16
brew install pgvector
brew services start postgresql@16
```

确认 PostgreSQL 可用：

```bash
psql --version
```

确认服务状态：

```bash
brew services list | grep postgresql
```

---

### 如果本机已有 PostgreSQL

确认版本和连接：

```bash
psql -d postgres -c "SELECT version();"
```

确认是否能启用 vector：

```bash
psql -d postgres -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

如果提示找不到 extension，需要先安装 pgvector。

---

## 8.2 创建开发数据库

推荐数据库名：

```txt
ying_companion_dev
```

创建数据库：

```bash
createdb ying_companion_dev
```

验证：

```bash
psql -d ying_companion_dev -c "SELECT current_database();"
```

---

## 8.3 启用 pgvector

进入开发数据库执行：

```bash
psql -d ying_companion_dev -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

验证：

```bash
psql -d ying_companion_dev -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"
```

预期看到：

```txt
vector
```

---

## 8.4 创建 companion_memories 表

如果项目已有 migration 文件：

```txt
packages/memory-postgres/migrations/0001_create_companion_memories.sql
```

则执行：

```bash
psql -d ying_companion_dev -f packages/memory-postgres/migrations/0001_create_companion_memories.sql
```

验证表存在：

```bash
psql -d ying_companion_dev -c "SELECT to_regclass('companion_memories');"
```

预期：

```txt
companion_memories
```

---

## 8.5 验证表结构和向量维度

执行：

```bash
psql -d ying_companion_dev -c "\d companion_memories"
```

重点确认：

```txt
embedding vector(1536)
```

因为默认 embedding 模型是：

```txt
text-embedding-3-small
```

对应当前文档约定维度：

```txt
1536
```

---

## 9. apps/model-runtime-demo/.env.example

本 patch 需要补齐：

```txt
apps/model-runtime-demo/.env.example
```

示例内容：

```env
# OpenAI-compatible chat model
OPENAI_API_KEY=sk-your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini

# PostgreSQL memory provider
DATABASE_URL=postgresql://localhost:5432/ying_companion_dev
MEMORY_POSTGRES_TABLE=companion_memories

# OpenAI-compatible embedding model
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

如果本地 PostgreSQL 需要用户名：

```env
DATABASE_URL=postgresql://<user>@localhost:5432/ying_companion_dev
```

如果需要密码：

```env
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/ying_companion_dev
```

注意：

```txt
.env.example 只放示例值
真实密钥只写入 .env.local 或 .env
不要提交真实 OPENAI_API_KEY
```

---

## 10. Demo 启动前检查

开发者按以下顺序执行：

```bash
pnpm install
```

准备数据库：

```bash
createdb ying_companion_dev
psql -d ying_companion_dev -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql -d ying_companion_dev -f packages/memory-postgres/migrations/0001_create_companion_memories.sql
```

复制 env：

```bash
cp apps/model-runtime-demo/.env.example apps/model-runtime-demo/.env.local
```

填写：

```txt
OPENAI_API_KEY
OPENAI_BASE_URL
OPENAI_MODEL
DATABASE_URL
OPENAI_EMBEDDING_MODEL
MEMORY_POSTGRES_TABLE
```

启动 demo：

```bash
pnpm --filter model-runtime-demo dev
```

---

## 11. Demo 验证路径

## 11.1 Health 检查

打开：

```txt
/apps/model-runtime-demo
```

或请求：

```txt
GET /api/memory-health
```

预期：

```txt
status: connected
databaseConnected: true
pgvectorEnabled: true
tableReady: true
provider: memory.postgres
tableName: companion_memories
embeddingModel: text-embedding-3-small
```

如果失败，Demo 页面必须显示具体错误，而不是静默回退 InMemory。

---

## 11.2 保存长期记忆

输入：

```txt
我喜欢五月天，尤其喜欢突然好想你。
```

预期 Demo 显示：

```txt
Extracted Memories
Saved Memories
Embedding Vector Length: 1536
Provider: memory.postgres
Database status: connected
```

数据库验证：

```bash
psql -d ying_companion_dev -c "SELECT type, content, importance FROM companion_memories ORDER BY created_at DESC LIMIT 5;"
```

预期看到与五月天相关的记忆。

---

## 11.3 召回长期记忆

继续输入：

```txt
推荐一首适合晚上听的歌。
```

预期 Demo 显示：

```txt
Recalled Memories
score
topK
Prompt Debug Panel 中出现长期记忆区块
```

AI 回复应该自然结合五月天或相关歌曲，但不能说：

```txt
根据我的记忆库
我查询到你的记忆
```

---

## 11.4 数据库异常验证

临时改错 `DATABASE_URL` 或停止 PostgreSQL 后，刷新 `/api/memory-health`。

预期：

```txt
Database status: error
lastError 有具体原因
聊天主回复不阻塞
memory recall/save 错误通过 observer 展示
```

---

## 12. 与 patch-0 的关系

`patch-0` 要求 Demo 使用真实 PostgreSQL，并展示 DB health、saved、recalled、score、embedding 等结果。

但 `patch-0` 的示例仍然以 `connectionString` 传给 `PostgresMemoryProvider`。

本 patch 修正这个点：

```txt
patch-0：
  Demo 接真实数据库，展示 DB Panel

patch-2：
  明确真实数据库连接由调用方创建并传入
  补齐本地 PostgreSQL / pgvector 从 0 到 1
  补齐 .env.example
```

所以 patch-2 是 patch-0 的连接责任收口，不是替代 patch-0。

---

## 13. 与 patch-1 的关系

`patch-1` 是滚动摘要能力，不处理 PostgreSQL 长期记忆，也不修改 `PostgresMemoryProvider`。

本 patch 不应影响：

```txt
ConversationSummary
SummaryProvider
SummaryUpdater
summary:* Observer 事件
Prompt / Context Debug Panel 中的 summary 展示
```

完成后，Demo 中可以同时存在：

```txt
Memory DB Panel
  展示真实 PostgreSQL 长期记忆

Context / Summary Panel
  展示滚动摘要
```

两者相互独立。

---

## 14. 验收清单

```txt
[ ] packages/ai-core 没有新增 pg / pgvector / drizzle 依赖
[ ] PostgresMemoryProviderOptions 不再要求 connectionString
[ ] PostgresMemoryProvider 不再内部 new Pool
[ ] PostgresMemoryProvider 只使用调用方传入的 Pool
[ ] PostgresMemoryProvider 不负责关闭调用方传入的 Pool
[ ] apps/model-runtime-demo 创建 pg Pool
[ ] apps/model-runtime-demo 管理 Pool 生命周期
[ ] apps/model-runtime-demo 将 Pool 传入 PostgresMemoryProvider
[ ] apps/model-runtime-demo/.env.example 包含 DATABASE_URL
[ ] apps/model-runtime-demo/.env.example 包含 MEMORY_POSTGRES_TABLE
[ ] apps/model-runtime-demo/.env.example 包含 OPENAI_EMBEDDING_MODEL
[ ] 文档说明如何安装 PostgreSQL
[ ] 文档说明如何安装 / 启用 pgvector
[ ] 文档说明如何创建 ying_companion_dev 数据库
[ ] 文档说明如何执行 companion_memories migration
[ ] GET /api/memory-health 返回真实数据库状态
[ ] Demo 页面显示 databaseConnected / pgvectorEnabled / tableReady
[ ] 输入“我喜欢五月天”后能保存到真实数据库
[ ] 后续输入能从真实数据库召回该记忆
[ ] 数据库错误不阻塞聊天主回复
[ ] 真实 API Key 不出现在 .env.example
```

---

## 15. 最终交付物

本 patch 完成后，应至少包含：

```txt
packages/memory-postgres
  PostgresMemoryProvider 改为只接收调用方传入 Pool
  保留 recall / save / healthCheck
  不再通过 connectionString 创建 Pool

apps/model-runtime-demo
  创建 pg Pool
  管理 pg Pool 生命周期
  注入 PostgresMemoryProvider
  memory-health 使用真实 Pool
  .env.example 补齐数据库配置

文档 / README
  本地安装 PostgreSQL
  安装 / 启用 pgvector
  创建 ying_companion_dev
  执行 companion_memories migration
  验证 health
  验证 save / recall
```

---

## 16. 一句话总结

```txt
patch-2 的核心不是增加新的记忆能力，而是把真实数据库连接从 Provider 内部移到调用方：
调用方创建和管理 PostgreSQL Pool，PostgresMemoryProvider 只使用传入连接，ai-core 继续保持纯 SDK。
```

这样后续接正式 API、用户系统、后台系统或商业化时，都可以复用同一个模式：

```txt
业务服务创建数据库实例
↓
传入 PostgresMemoryProvider
↓
注入 CompanionCore
↓
Core 无感知
```
