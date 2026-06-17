# @ying-companion/memory-postgres

PostgreSQL + pgvector memory provider for `@ying-companion/ai-core`.

本包只实现 `MemoryProvider` 适配器，不读取环境变量，也不创建数据库连接。调用方负责创建并管理 `pg.Pool`，再传入 `PostgresMemoryProvider`。

## 本地数据库准备

### 安装 PostgreSQL 与 pgvector

macOS 推荐使用 Homebrew：

```bash
brew install postgresql@16
brew install pgvector
brew services start postgresql@16
```

确认 PostgreSQL 可用：

```bash
psql --version
brew services list | grep postgresql
```

如果本机已有 PostgreSQL，先确认版本和连接：

```bash
psql -d postgres -c "SELECT version();"
psql -d postgres -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

如果提示找不到 `vector` extension，需要先安装 pgvector。

### 创建开发数据库

推荐数据库名：

```txt
ying_companion_dev
```

创建并验证：

```bash
createdb ying_companion_dev
psql -d ying_companion_dev -c "SELECT current_database();"
```

### 启用 pgvector

```bash
psql -d ying_companion_dev -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql -d ying_companion_dev -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"
```

预期看到：

```txt
vector
```

`migrations/0001_create_companion_memories.sql` 首行已经包含 `CREATE EXTENSION IF NOT EXISTS vector;`。这里单独列出是为了在 migration 失败时方便分步排查。

### 创建 companion_memories 表

在仓库根目录执行：

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

验证表结构和向量维度：

```bash
psql -d ying_companion_dev -c "\d companion_memories"
```

默认 embedding 模型为 `text-embedding-3-small`，当前 migration 使用：

```txt
embedding vector(1536)
```

如果替换 embedding 模型，必须保证模型输出维度与表结构一致。

## Pool 注入示例

调用方创建并持有 `Pool`，并在应用生命周期结束或配置切换时关闭它：

```ts
import { Pool } from "pg";
import { OpenAIEmbeddingProvider, PostgresMemoryProvider } from "@ying-companion/memory-postgres";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const embeddingProvider = new OpenAIEmbeddingProvider({
  apiKey: process.env.OPENAI_API_KEY ?? "",
  baseUrl: process.env.OPENAI_BASE_URL,
  model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
});

const memory = new PostgresMemoryProvider({
  pool,
  embeddingProvider,
  tableName: process.env.MEMORY_POSTGRES_TABLE ?? "companion_memories",
});

const health = await memory.healthCheck();

// Later, owned by caller:
await pool.end();
```

`PostgresMemoryProvider.dispose()` 保留为兼容方法，但不会关闭调用方传入的 `Pool`。

## Demo 验证

`apps/model-runtime-demo` 会读取：

```txt
DATABASE_URL
MEMORY_POSTGRES_TABLE
OPENAI_API_KEY
OPENAI_BASE_URL
OPENAI_EMBEDDING_MODEL
```

启动前先复制并填写 env：

```bash
cp apps/model-runtime-demo/.env.example apps/model-runtime-demo/.env
pnpm --filter @ying-companion/model-runtime-demo dev
```

打开 demo 后，`GET /api/memory-health` 和 Memory DB Panel 应显示：

```txt
status: connected
databaseConnected: true
pgvectorEnabled: true
tableReady: true
provider: memory.postgres
```

输入“我喜欢五月天，尤其喜欢突然好想你。”后，应能在页面看到 saved memories，并可用 SQL 验证：

```bash
psql -d ying_companion_dev -c "SELECT type, content, importance FROM companion_memories ORDER BY created_at DESC LIMIT 5;"
```

继续输入“推荐一首适合晚上听的歌。”后，应能在页面看到 recalled memories 和 score。
