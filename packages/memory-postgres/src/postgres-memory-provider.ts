/**
 * PostgreSQL + pgvector 长期记忆 Provider。
 *
 * 实现 ai-core 的 MemoryProvider：
 * - recall：将 query 向量化后，按 scope + importance 过滤，pgvector 余弦 TopK 召回
 * - save：事务内逐条 embed + INSERT，同 scope 下 type+content 去重
 * - healthCheck：连接 / pgvector 扩展 / 目标表就绪探测（不抛错，供宿主 fallback）
 *
 * Pool 由调用方创建并持有；dispose() 为 no-op，不关闭连接池。
 */
import type { Pool, PoolClient } from "pg";

import type {
  EmbeddingProvider,
  ExtractedMemory,
  MemoryImportance,
  MemoryProvider,
  MemoryRecallInput,
  MemoryRecallResult,
  MemoryRecord,
  MemorySaveInput,
  MemorySaveResult,
  MemoryScope,
  MemorySource,
  MemoryType,
  RecalledMemory,
} from "@ying-ai/ai-core";

/** PostgresMemoryProvider 构造参数；tableName 须为合法 SQL 标识符。 */
export interface PostgresMemoryProviderOptions {
  /** 由宿主创建并持有的连接池；本类不调用 pool.end()。 */
  pool: Pool;
  /** 文本向量化实现，recall/save 时 embed query 与 content。 */
  embeddingProvider: EmbeddingProvider;
  /** 目标表名，默认 companion_memories；须通过 validateTableName 校验。 */
  tableName?: string;
}

/**
 * 数据库健康检查结果（patch-0 §11.4）。
 * 供宿主在 /api/memory-health 与 Memory DB Panel 中展示，
 * 不在 chat 请求路径中做重型检测。
 */
export interface MemoryDatabaseHealth {
  /** 三项检查均通过时为 true。 */
  ok: boolean;
  /** SELECT 1 是否成功。 */
  databaseConnected: boolean;
  /** pg_extension 中是否存在 vector。 */
  pgvectorEnabled: boolean;
  /** to_regclass(tableName) 是否存在。 */
  tableReady: boolean;
  /** 检查失败时的错误摘要；ok=true 时通常无此字段。 */
  error?: string;
}

/** 数据库行结构与 companion_memories 表列一一对应。 */
interface MemoryRow {
  id: string;
  owner_type: MemoryScope["ownerType"];
  owner_id: string;
  companion_id: string | null;
  type: MemoryType;
  content: string;
  importance: MemoryImportance;
  source_conversation_id: string | null;
  source_message_ids: string[] | null;
  source_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date | null;
  score?: number;
}

/** PostgreSQL + pgvector 版 MemoryProvider；见文件头注释了解 recall/save/healthCheck 职责。 */
export class PostgresMemoryProvider implements MemoryProvider {
  public readonly meta = {
    id: "memory.postgres",
    kind: "memory",
    name: "PostgreSQL Memory Provider",
    description: "Long-term memory backed by PostgreSQL and pgvector",
    version: "1.0.0",
  } as const;

  private readonly pool: Pool;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly tableName: string;

  public constructor(options: PostgresMemoryProviderOptions) {
    this.pool = options.pool;
    this.embeddingProvider = options.embeddingProvider;
    this.tableName = validateTableName(options.tableName ?? "companion_memories");
  }

  /** 语义召回：query 向量化 → pgvector 余弦距离排序 → 返回 TopK 与 score。 */
  public async recall(input: MemoryRecallInput): Promise<MemoryRecallResult> {
    const limit = input.limit ?? 5;
    const minImportance = input.minImportance ?? 3;
    const embedding = await this.embeddingProvider.embed({ text: input.query });
    const vector = toPgVector(embedding.vector);
    const result = await this.pool.query<MemoryRow>(
      `
        SELECT
          id,
          owner_type,
          owner_id,
          companion_id,
          type,
          content,
          importance,
          source_conversation_id,
          source_message_ids,
          source_reason,
          metadata,
          created_at,
          updated_at,
          1 - (embedding <=> $1::vector) AS score
        FROM ${this.tableName}
        WHERE owner_type = $2
          AND owner_id = $3
          AND companion_id IS NOT DISTINCT FROM $4
          AND importance >= $5
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $6
      `,
      [
        vector,
        input.scope.ownerType,
        input.scope.ownerId,
        input.scope.companionId ?? null,
        minImportance,
        limit,
      ],
    );

    return {
      memories: result.rows.map(rowToRecalledMemory),
      embeddingVectorLength: embedding.vector.length,
    };
  }

  /** 批量持久化：单事务内 embed + INSERT；低 importance 与重复记忆写入 skipped。 */
  public async save(input: MemorySaveInput): Promise<MemorySaveResult> {
    const client = await this.pool.connect();

    try {
      const saved: MemoryRecord[] = [];
      const skipped: ExtractedMemory[] = [];
      let embeddingVectorLength: number | undefined;

      await client.query("BEGIN");

      for (const memory of input.memories) {
        if (memory.importance < 3) {
          skipped.push(memory);
          continue;
        }

        const duplicate = await hasDuplicate(client, this.tableName, input.scope, memory);

        if (duplicate) {
          skipped.push(memory);
          continue;
        }

        const embedding = await this.embeddingProvider.embed({ text: memory.content });
        embeddingVectorLength = embedding.vector.length;
        const id = createMemoryId();
        const result = await client.query<MemoryRow>(
          `
            INSERT INTO ${this.tableName} (
              id,
              owner_type,
              owner_id,
              companion_id,
              type,
              content,
              importance,
              embedding,
              source_conversation_id,
              source_message_ids,
              source_reason,
              metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, $10, $11, $12)
            RETURNING
              id,
              owner_type,
              owner_id,
              companion_id,
              type,
              content,
              importance,
              source_conversation_id,
              source_message_ids,
              source_reason,
              metadata,
              created_at,
              updated_at
          `,
          [
            id,
            input.scope.ownerType,
            input.scope.ownerId,
            input.scope.companionId ?? null,
            memory.type,
            memory.content,
            memory.importance,
            toPgVector(embedding.vector),
            input.source?.conversationId ?? null,
            input.source?.messageIds ?? null,
            input.source?.reason ?? memory.reason ?? null,
            memory.metadata ?? null,
          ],
        );

        const row = result.rows[0];

        if (row !== undefined) {
          saved.push(rowToMemoryRecord(row));
        }
      }

      await client.query("COMMIT");

      return {
        saved,
        skipped,
        ...(embeddingVectorLength !== undefined ? { embeddingVectorLength } : {}),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {
        // ROLLBACK 失败时保留原始 save 错误向上抛出
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 轻量健康检查（patch-0 §11.4）：连接、pgvector 扩展、目标表是否就绪。
   * 任一失败时返回 ok=false 并附带 error，不抛出，便于宿主严格 fallback。
   */
  public async healthCheck(): Promise<MemoryDatabaseHealth> {
    let databaseConnected = false;
    let pgvectorEnabled = false;
    let tableReady = false;

    try {
      const ping = await this.pool.query<{ ok: number }>("SELECT 1 AS ok");
      databaseConnected = ping.rows[0]?.ok === 1;

      const extension = await this.pool.query<{ extname: string }>(
        "SELECT extname FROM pg_extension WHERE extname = 'vector'",
      );
      pgvectorEnabled = extension.rows.length > 0;

      const table = await this.pool.query<{ exists: boolean }>(
        "SELECT to_regclass($1) IS NOT NULL AS exists",
        [this.tableName],
      );
      tableReady = table.rows[0]?.exists ?? false;

      return {
        ok: databaseConnected && pgvectorEnabled && tableReady,
        databaseConnected,
        pgvectorEnabled,
        tableReady,
      };
    } catch (error) {
      return {
        ok: false,
        databaseConnected,
        pgvectorEnabled,
        tableReady,
        error: error instanceof Error ? error.message : "memory health check failed",
      };
    }
  }

  /** 兼容方法：连接池生命周期由调用方管理，此处不关闭 Pool。 */
  public async dispose(): Promise<void> {
    // 连接池由宿主管理，此处 intentionally no-op
  }
}

/** 同 scope 下 type + content 完全相同时视为重复，跳过写入。 */
async function hasDuplicate(
  client: PoolClient,
  tableName: string,
  scope: MemoryScope,
  memory: ExtractedMemory,
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM ${tableName}
        WHERE owner_type = $1
          AND owner_id = $2
          AND companion_id IS NOT DISTINCT FROM $3
          AND type = $4
          AND content = $5
      ) AS exists
    `,
    [scope.ownerType, scope.ownerId, scope.companionId ?? null, memory.type, memory.content],
  );

  return result.rows[0]?.exists ?? false;
}

/** 将查询行映射为 RecalledMemory，附带 pgvector 相似度 score。 */
function rowToRecalledMemory(row: MemoryRow): RecalledMemory {
  return {
    ...rowToMemoryRecord(row),
    ...(row.score !== undefined ? { score: Number(row.score) } : {}),
  };
}

/** 将数据库行映射为 ai-core 的 MemoryRecord 领域类型。 */
function rowToMemoryRecord(row: MemoryRow): MemoryRecord {
  const source = rowToSource(row);

  return {
    id: row.id,
    scope: {
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      ...(row.companion_id !== null ? { companionId: row.companion_id } : {}),
    },
    type: row.type,
    content: row.content,
    importance: row.importance,
    ...(source !== undefined ? { source } : {}),
    ...(row.metadata !== null ? { metadata: row.metadata } : {}),
    createdAt: row.created_at,
    ...(row.updated_at !== null ? { updatedAt: row.updated_at } : {}),
  };
}

/** 将 DB source_* 列映射为 ai-core MemorySource；全空时返回 undefined。 */
function rowToSource(row: MemoryRow): MemorySource | undefined {
  if (
    row.source_conversation_id === null &&
    row.source_message_ids === null &&
    row.source_reason === null
  ) {
    return undefined;
  }

  return {
    ...(row.source_conversation_id !== null ? { conversationId: row.source_conversation_id } : {}),
    ...(row.source_message_ids !== null ? { messageIds: row.source_message_ids } : {}),
    ...(row.source_reason !== null ? { reason: row.source_reason } : {}),
  };
}

/** 将 number[] 格式化为 pgvector 字面量 `[x,y,z,...]`。 */
function toPgVector(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/** 校验表名，防止 SQL 注入（仅允许简单标识符，用于动态 FROM/INSERT）。 */
function validateTableName(tableName: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
    throw new Error("PostgresMemoryProvider tableName must be a simple SQL identifier");
  }

  return tableName;
}

/** 生成记忆主键；优先 crypto.randomUUID，降级为时间戳随机串。 */
function createMemoryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `memory_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
