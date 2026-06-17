import {
  InMemoryMemoryProvider,
  type MemoryProvider,
  type MemoryRecallInput,
  type MemoryRecallResult,
  type MemorySaveInput,
  type MemorySaveResult,
} from "@ying-companion/ai-core";
import {
  OpenAIEmbeddingProvider,
  PostgresMemoryProvider,
  type MemoryDatabaseHealth,
} from "@ying-companion/memory-postgres";
import { Pool } from "pg";

import { readOptionalEnv } from "./model-config";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_TABLE_NAME = "companion_memories";

/**
 * patch-0 §8.2 三种固定 fallback 状态：
 * - disabled：缺 DATABASE_URL，使用 InMemory（便于无库调试聊天）；
 * - connected：DATABASE_URL 存在且 healthCheck 通过，使用 Postgres；
 * - error：DATABASE_URL 存在但 healthCheck 失败，严格使用 Unavailable（禁止静默回退 InMemory）。
 */
export type MemoryDatabaseStatus = "disabled" | "connected" | "error";

export interface MemoryRuntime {
  provider: MemoryProvider;
  status: MemoryDatabaseStatus;
  embeddingModel?: string;
  tableName?: string;
  reason?: string;
  health?: MemoryDatabaseHealth;
}

/**
 * 严格 fallback 用的 demo 级 provider：recall/save 直接抛出缓存的 health error。
 *
 * 目的（patch-0 §14.6）：health 失败时聊天不阻塞，但 workflow 仍走 catch 分支，
 * observer 发出 `memory:*:end { ok:false }`，调试者从事件即可判断是 DB 配置故障，
 * 而不是「正常无记忆」。meta.id 用 memory.unavailable 便于面板区分。
 */
class UnavailableMemoryProvider implements MemoryProvider {
  public readonly meta = {
    id: "memory.unavailable",
    kind: "memory",
    name: "Unavailable Memory Provider",
    description: "Strict fallback that surfaces the database health error on every operation",
    version: "1.0.0",
  } as const;

  private readonly reason: string;

  public constructor(reason: string) {
    this.reason = reason;
  }

  public async recall(input: MemoryRecallInput): Promise<MemoryRecallResult> {
    void input;
    throw new Error(this.reason);
  }

  public async save(input: MemorySaveInput): Promise<MemorySaveResult> {
    void input;
    throw new Error(this.reason);
  }
}

interface MemoryEnvConfig {
  connectionString?: string;
  embeddingModel: string;
  tableName: string;
  apiKey?: string;
  baseUrl?: string;
}

interface PostgresRuntime {
  key: string;
  pool: Pool;
  provider: PostgresMemoryProvider;
  embeddingModel: string;
  tableName: string;
}

/** 最近一次 health 探测结果。chat 路径只读这里，绝不在热路径里探测 DB（patch-0 §8/§11.4）。 */
interface HealthSnapshot {
  key: string;
  status: MemoryDatabaseStatus;
  health?: MemoryDatabaseHealth;
  reason?: string;
}

// 进程内单例：避免每个请求重新建连接池（dev 热重载下按 key 复用）。
const inMemoryDemoMemory = new InMemoryMemoryProvider();
let postgresRuntime: PostgresRuntime | undefined;
let healthSnapshot: HealthSnapshot | undefined;

/**
 * 只读取 memory / embedding 相关 env，不依赖完整模型生成配置。
 * 这样即便 OPENAI_MODEL 缺失，/api/memory-health 仍能报告 DB 状态（patch-0 §11.4）。
 */
export function readMemoryEnvConfig(env: NodeJS.ProcessEnv): MemoryEnvConfig {
  const connectionString = readOptionalEnv(env, "DATABASE_URL");
  const apiKey = readOptionalEnv(env, "OPENAI_API_KEY");
  const baseUrl = readOptionalEnv(env, "OPENAI_BASE_URL");

  return {
    ...(connectionString !== undefined ? { connectionString } : {}),
    embeddingModel: readOptionalEnv(env, "OPENAI_EMBEDDING_MODEL") ?? DEFAULT_EMBEDDING_MODEL,
    tableName: readOptionalEnv(env, "MEMORY_POSTGRES_TABLE") ?? DEFAULT_TABLE_NAME,
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(baseUrl !== undefined ? { baseUrl } : {}),
  };
}

function runtimeKey(config: MemoryEnvConfig): string {
  return [
    config.connectionString ?? "",
    config.apiKey ?? "",
    config.baseUrl ?? "",
    config.embeddingModel,
    config.tableName,
  ].join("\n");
}

/**
 * 按 env 构造（或复用）Postgres runtime。仅在存在 DATABASE_URL 时返回。
 * key 变化时先释放旧连接池再重建，避免热重载 / 切库时泄露 pool。
 */
async function resolvePostgresRuntime(
  config: MemoryEnvConfig,
): Promise<PostgresRuntime | undefined> {
  if (config.connectionString === undefined) {
    return undefined;
  }

  const key = runtimeKey(config);

  if (postgresRuntime?.key === key) {
    return postgresRuntime;
  }

  if (postgresRuntime !== undefined) {
    // 替换前释放旧 pool；清理失败不应阻断新 runtime 构造。
    await postgresRuntime.pool.end().catch(() => {
      // best-effort cleanup
    });
  }

  const pool = new Pool({
    connectionString: config.connectionString,
  });
  const embeddingProvider = new OpenAIEmbeddingProvider({
    // health 探测本身不发 embedding 请求；apiKey 缺失时占位，仅 chat/save 路径会真正调用。
    apiKey: config.apiKey ?? "",
    model: config.embeddingModel,
    ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
  });
  const provider = new PostgresMemoryProvider({
    pool,
    embeddingProvider,
    tableName: config.tableName,
  });

  postgresRuntime = {
    key,
    pool,
    provider,
    embeddingModel: config.embeddingModel,
    tableName: config.tableName,
  };

  return postgresRuntime;
}

/**
 * 主动探测 DB health 并更新进程级 snapshot。
 * 仅供 /api/memory-health（页面加载 / 显式刷新）调用，不在 chat 热路径里执行（patch-0 §8/§11.4）。
 */
export async function inspectMemoryHealth(env: NodeJS.ProcessEnv): Promise<MemoryRuntime> {
  const config = readMemoryEnvConfig(env);
  const runtime = await resolvePostgresRuntime(config);

  if (runtime === undefined) {
    healthSnapshot = {
      key: runtimeKey(config),
      status: "disabled",
      reason: "DATABASE_URL is missing",
    };

    return {
      provider: inMemoryDemoMemory,
      status: "disabled",
      reason: "DATABASE_URL is missing",
    };
  }

  const health = await runtime.provider.healthCheck();

  if (health.ok) {
    healthSnapshot = { key: runtime.key, status: "connected", health };

    return {
      provider: runtime.provider,
      status: "connected",
      embeddingModel: runtime.embeddingModel,
      tableName: runtime.tableName,
      health,
    };
  }

  const reason = health.error ?? "memory database health check failed";
  healthSnapshot = { key: runtime.key, status: "error", health, reason };

  return {
    provider: new UnavailableMemoryProvider(reason),
    status: "error",
    embeddingModel: runtime.embeddingModel,
    tableName: runtime.tableName,
    health,
    reason,
  };
}

/**
 * 为聊天请求选择 memory provider（patch-0 §8.2 严格 fallback）。
 *
 * 关键约束：**不在 chat 热路径里探测 DB**。仅读取最近一次 /api/memory-health 写入的 snapshot：
 * - 缺 DATABASE_URL → InMemory；
 * - snapshot=error 且 key 匹配 → Unavailable（observer 可见 error，§14.6）；
 * - snapshot=connected 且 key 匹配 → Postgres；
 * - 无 snapshot / key 不匹配（冷启动或 env 变更）→ 乐观使用 Postgres，
 *   让真实 recall/save 错误经 observer 暴露，页面下次刷新 health 后即对齐。
 */
export async function resolveChatMemoryRuntime(env: NodeJS.ProcessEnv): Promise<MemoryRuntime> {
  const config = readMemoryEnvConfig(env);

  if (config.connectionString === undefined) {
    return { provider: inMemoryDemoMemory, status: "disabled", reason: "DATABASE_URL is missing" };
  }

  const runtime = await resolvePostgresRuntime(config);

  if (runtime === undefined) {
    return { provider: inMemoryDemoMemory, status: "disabled", reason: "DATABASE_URL is missing" };
  }

  const snapshotMatches = healthSnapshot?.key === runtime.key;

  if (snapshotMatches && healthSnapshot?.status === "error") {
    const reason = healthSnapshot.reason ?? "memory database health check failed";

    return {
      provider: new UnavailableMemoryProvider(reason),
      status: "error",
      embeddingModel: runtime.embeddingModel,
      tableName: runtime.tableName,
      ...(healthSnapshot.health !== undefined ? { health: healthSnapshot.health } : {}),
      reason,
    };
  }

  // connected 或冷启动：直接用 Postgres provider，真实 DB 错误会在 recall/save 经 observer 暴露。
  return {
    provider: runtime.provider,
    status: snapshotMatches && healthSnapshot !== undefined ? healthSnapshot.status : "connected",
    embeddingModel: runtime.embeddingModel,
    tableName: runtime.tableName,
    ...(snapshotMatches && healthSnapshot?.health !== undefined
      ? { health: healthSnapshot.health }
      : {}),
  };
}
