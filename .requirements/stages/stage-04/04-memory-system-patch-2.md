# 04-memory-system-patch-2.md

## 阶段 4 Patch 2：连接调用方传入的真实数据库

> 本 patch 目标：把 `packages/memory-postgres` 的数据库连接责任进一步收紧为“调用方创建并传入真实数据库实例”，同时补齐本地 PostgreSQL + pgvector 从 0 到 1 的文档路径。
> 本 patch 不重新设计长期记忆系统，不重新设计滚动摘要，不改变 `MemoryProvider` 抽象。
> **代码改动面小**（主要是 `PostgresMemoryProviderOptions` + `memory-config.ts` 的 Pool 生命周期）；health、严格 fallback、migration、`.env.example` 等已在 patch-0 落地，本 patch 以连接责任收口与文档补齐为主。

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

并在 `resolvePostgresRuntime` 里创建 `OpenAIEmbeddingProvider` 与 `PostgresMemoryProvider`。当前创建方式仍然是传入 `connectionString`，env key 变化时通过 `provider.dispose()` 释放旧 pool（patch-0 §19.4）。

**patch-0 已完成的基线（本 patch 不重做，仅验证仍有效）：**

```txt
packages/memory-postgres/migrations/0001_create_companion_memories.sql
GET /api/memory-health + healthCheck()
严格 fallback（disabled / connected / error，禁止 health 失败时静默回退 InMemory）
UnavailableMemoryProvider + health snapshot（chat 热路径不探测 DB）
apps/model-runtime-demo/.env.example 已含 DATABASE_URL / MEMORY_POSTGRES_TABLE / OPENAI_EMBEDDING_MODEL
apps/model-runtime-demo/README.md 已有 migration 与 provider 选择策略说明
```

因此本 patch **不是**从零实现 `PostgresMemoryProvider`，剩余工作主要是：

```txt
1. 把数据库连接创建责任从 Provider 移动到调用方（核心代码改动）
2. 新增 packages/memory-postgres/README.md，补齐本地 PostgreSQL + pgvector 从安装到建表的路径
3. 核对并完善 .env.example 注释（字段已基本齐全）
4. 更新 stage-04 主文档 / patch-0 中过时的 connectionString 示例
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
1. 本机可按文档安装 PostgreSQL + pgvector（见 packages/memory-postgres/README.md）
2. 可创建 ying_companion_dev 并执行 migration
3. apps/model-runtime-demo 由调用方创建 pg Pool 并注入 PostgresMemoryProvider
4. PostgresMemoryProvider 只接收调用方传入的 Pool（不再接受 connectionString）
5. /api/memory-health、严格 fallback 在 Pool 模式下仍正常（patch-0 行为回归）
6. Demo 页面可完成真实 save / recall
7. 数据库异常不阻塞聊天主回复
```

---

## 5. Patch 边界

## 5.1 本 patch 要做

**代码（核心）：**

1. 调整 `PostgresMemoryProviderOptions`：`pool` 必填，移除 `connectionString`；
2. 移除 `PostgresMemoryProvider` 内部通过 `connectionString` 创建 `Pool` 的路径，删除 `ownsPool`；
3. `dispose()` 保留为 **no-op**（见 §6.3），不关闭调用方传入的 Pool；
4. 在 `apps/model-runtime-demo` 中创建真实 `pg.Pool`，`PostgresRuntime` 持有 `pool`；
5. env key 变化时由 Demo 调用 `pool.end()`，**不再**调用 `provider.dispose()` 释放连接；
6. 将 `Pool` 传入 `PostgresMemoryProvider`；
7. 验证 `healthCheck()`、`/api/memory-health`、严格 fallback 在 Pool 注入模式下仍正常。

**文档：**

8. **新增** `packages/memory-postgres/README.md`：安装 PostgreSQL / pgvector、建库、migration、Pool 注入示例；
9. **更新** `apps/model-runtime-demo/README.md`：引用上述 README，补充 Demo 启动与验证步骤；
10. **核对** `apps/model-runtime-demo/.env.example` 注释与示例值（字段已存在则补注释，不必重复造字段）；
11. **更新** `04-memory-system.md` 与 `04-memory-system-patch-0.md` 中 `PostgresMemoryProvider({ connectionString })` 的过时示例为 `pool` 注入模式。

**验证：**

12. 按 §11 验证 Demo 能真实 save / recall，数据库异常不阻塞聊天。

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

当前 `PostgresMemoryProvider` 有 `dispose()`，并且只有 `ownsPool` 为 true 时才 `pool.end()`。patch-0 §11.1 要求保留 `dispose()`。

本 patch 后，`PostgresMemoryProvider` 永远不拥有 Pool，因此 **supersede** patch-0 §11.1 / §19.4 中「通过 `provider.dispose()` 释放 pool」的语义：

```txt
PostgresMemoryProvider.dispose()
  必须保留（与 patch-0 接口一致）
  实现为 no-op，不调用 pool.end()

Pool.end()
  由 apps/model-runtime-demo 或未来调用方在 runtime key 变化 / 进程退出时负责
```

`memory-config.ts` 中替换 runtime 的逻辑应从：

```ts
await postgresRuntime.provider.dispose().catch(() => {});
```

改为：

```ts
await postgresRuntime.pool.end().catch(() => {});
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

`ownsPool` 删除。

`dispose()` 保留，实现为空操作：

```ts
public async dispose(): Promise<void> {
  // no-op: pool lifecycle owned by caller
}
```

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

`/api/memory-health` 与严格 fallback 逻辑 **已在 patch-0 实现**，本 patch 不改其行为，仅在 Pool 由 Demo 创建后回归验证。

---

## 7.4 文档落点

避免“文档 / README”表述模糊，本 patch 文档分工如下：

| 内容                                                                                    | 落点                                                                        |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| PostgreSQL / pgvector 安装、建库、migration、`Pool` + `PostgresMemoryProvider` 注入示例 | **新增** `packages/memory-postgres/README.md`                               |
| Demo env、provider 选择策略、启动命令、§11 验证路径引用                                 | **更新** `apps/model-runtime-demo/README.md`（链到 memory-postgres README） |
| env 字段示例与注释                                                                      | **核对** `apps/model-runtime-demo/.env.example`                             |
| 过时的 `connectionString` 构造示例                                                      | **更新** `04-memory-system.md`、`04-memory-system-patch-0.md`               |

---

## 8. 本地数据库从 0 到 1

以下内容写入 `packages/memory-postgres/README.md`（§8 为正文提纲，实现时按 README 落地）。

本 patch 要求开发者可以从一台没有项目数据库的机器开始，完成本地数据库准备。

项目不提供 Docker / docker-compose，继续遵守 patch-0 的边界。§8.1 以 macOS + Homebrew 为主；Linux / Windows 开发者按各自包管理器安装 PostgreSQL 16+ 与 pgvector 即可，本 patch 不展开。

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

> **与 §8.4 的关系：** `0001_create_companion_memories.sql` 首行已含 `CREATE EXTENSION IF NOT EXISTS vector;`。仅执行 migration 也会启用 pgvector。§8.3 单独列出是为了：在 migration 失败时便于分步排查 extension 是否安装成功。

---

## 8.4 创建 companion_memories 表

migration 文件：

```txt
packages/memory-postgres/migrations/0001_create_companion_memories.sql
```

执行（同时创建 extension + 表 + 索引）：

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

**当前状态：** patch-0 已写入 `DATABASE_URL`、`MEMORY_POSTGRES_TABLE`、`OPENAI_EMBEDDING_MODEL` 等字段。本 patch **核对并补注释**，不必重复添加已有 key。

目标示例（与现有文件对齐，缺注释则补）：

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
.env.example 只放示例值，不要提交真实 OPENAI_API_KEY
真实密钥写入 apps/model-runtime-demo/.env（与 demo README 一致；Next.js 亦支持 .env.local）
```

---

## 10. Demo 启动前检查

开发者按以下顺序执行（细节见 `packages/memory-postgres/README.md` + `apps/model-runtime-demo/README.md`）：

```bash
pnpm install
```

准备数据库（§8.4 migration 已含 extension，可省略单独的 §8.3 步骤）：

```bash
createdb ying_companion_dev
psql -d ying_companion_dev -f packages/memory-postgres/migrations/0001_create_companion_memories.sql
```

复制 env：

```bash
cp apps/model-runtime-demo/.env.example apps/model-runtime-demo/.env
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

`patch-0` 要求 Demo 使用真实 PostgreSQL，并展示 DB health、saved、recalled、score、embedding 等结果。上述能力 **已实现**，patch-2 不替代 patch-0。

本 patch 在 patch-0 之上修正连接责任，并 **supersede** 以下过时约定：

| patch-0 约定                                            | patch-2 修正                      |
| ------------------------------------------------------- | --------------------------------- |
| 示例以 `connectionString` 构造 `PostgresMemoryProvider` | 调用方 `new Pool()` 后传入 `pool` |
| env key 变化时 `provider.dispose()` 释放 pool           | 调用方 `pool.end()`               |
| `dispose()` 在自建 pool 时关闭连接                      | `dispose()` 保留为 no-op          |

实现完成后须同步更新 `04-memory-system-patch-0.md` §5.2、§11 及相关示例代码块，避免读者按旧 API 集成。

```txt
patch-0：Demo 接真实数据库，展示 DB Panel、health、严格 fallback（已完成）
patch-2：连接责任收口 + memory-postgres README + 文档示例对齐（本 patch）
```

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

### 14.1 patch-0 已满足（本 patch 回归验证即可）

```txt
[x] packages/ai-core 没有 pg / pgvector / drizzle 依赖
[x] migration 文件存在且可执行
[x] GET /api/memory-health 返回真实数据库状态
[x] 严格 fallback：health 失败不静默回退 InMemory
[x] chat 热路径不探测 DB（health snapshot）
[x] apps/model-runtime-demo/.env.example 含 DATABASE_URL / MEMORY_POSTGRES_TABLE / OPENAI_EMBEDDING_MODEL
[x] 真实 API Key 不出现在 .env.example
```

### 14.2 本 patch 必须完成

```txt
[ ] PostgresMemoryProviderOptions 不再要求 connectionString，pool 必填
[ ] PostgresMemoryProvider 不再内部 new Pool，删除 ownsPool
[ ] PostgresMemoryProvider.dispose() 为 no-op，不调用 pool.end()
[ ] apps/model-runtime-demo 创建 pg Pool 并持有于 PostgresRuntime
[ ] env key 变化时 apps/model-runtime-demo 调用 pool.end()，不依赖 provider.dispose()
[ ] apps/model-runtime-demo 将 Pool 传入 PostgresMemoryProvider
[ ] 新增 packages/memory-postgres/README.md（§8 内容 + Pool 注入示例）
[ ] 更新 apps/model-runtime-demo/README.md（引用 memory-postgres README）
[ ] 更新 04-memory-system.md / 04-memory-system-patch-0.md 中过时 connectionString 示例
[ ] Demo 页面显示 databaseConnected / pgvectorEnabled / tableReady
[ ] 输入「我喜欢五月天」后能保存到真实数据库
[ ] 后续输入能从真实数据库召回该记忆
[ ] 数据库错误不阻塞聊天主回复
```

---

## 15. 最终交付物

本 patch 完成后，应至少包含：

```txt
packages/memory-postgres/
  src/postgres-memory-provider.ts   # pool 必填；dispose() no-op
  README.md                         # 新增：§8 本地 DB 路径 + Pool 注入示例

apps/model-runtime-demo/
  app/lib/memory-config.ts          # 创建 Pool；key 变化时 pool.end()
  .env.example                      # 核对注释（字段已有）
  README.md                         # 更新：链到 memory-postgres README

.requirements/stages/stage-04/
  04-memory-system.md               # 更新 PostgresMemoryProvider 示例
  04-memory-system-patch-0.md       # 更新 §5.2 / §19.4 示例与 dispose 语义说明
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
