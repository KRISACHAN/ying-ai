import {
  InMemoryMemoryProvider,
  NoopMemoryProvider,
  type CreateModelOptions,
  type MemoryProvider,
} from "@ying-companion/ai-core";
import {
  OpenAIEmbeddingProvider,
  PostgresMemoryProvider,
  type MemoryDatabaseHealth,
} from "@ying-companion/memory-postgres";

import { readOptionalEnv } from "./model-config";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * patch-0 §8.2 三种固定 fallback 状态：
 * - disabled：缺 DATABASE_URL，使用 InMemory（便于无库调试聊天）；
 * - connected：DATABASE_URL 存在且 healthCheck 通过，使用 Postgres；
 * - error：DATABASE_URL 存在但 healthCheck 失败，严格使用 Noop（禁止静默回退 InMemory）。
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

interface PostgresRuntime {
  key: string;
  provider: PostgresMemoryProvider;
  embeddingModel: string;
  tableName: string;
}

// 进程内单例：避免每个请求重新建连接池（dev 热重载下按 key 复用）。
const inMemoryDemoMemory = new InMemoryMemoryProvider();
const noopDemoMemory = new NoopMemoryProvider();
let postgresRuntime: PostgresRuntime | undefined;

/**
 * 按 env + 模型配置构造（或复用）Postgres runtime。
 * 仅当存在 DATABASE_URL 时返回；否则返回 undefined。
 */
function resolvePostgresRuntime(
  env: NodeJS.ProcessEnv,
  modelConfig: CreateModelOptions,
): PostgresRuntime | undefined {
  const connectionString = readOptionalEnv(env, "DATABASE_URL");

  if (connectionString === undefined) {
    return undefined;
  }

  const embeddingModel = readOptionalEnv(env, "OPENAI_EMBEDDING_MODEL") ?? DEFAULT_EMBEDDING_MODEL;
  const tableName = readOptionalEnv(env, "MEMORY_POSTGRES_TABLE");
  const key = [
    connectionString,
    modelConfig.apiKey,
    modelConfig.baseUrl ?? "",
    embeddingModel,
    tableName ?? "",
  ].join("\n");

  if (postgresRuntime?.key === key) {
    return postgresRuntime;
  }

  const embeddingProvider = new OpenAIEmbeddingProvider({
    apiKey: modelConfig.apiKey,
    model: embeddingModel,
    ...(modelConfig.baseUrl !== undefined ? { baseUrl: modelConfig.baseUrl } : {}),
  });
  const provider = new PostgresMemoryProvider({
    connectionString,
    embeddingProvider,
    ...(tableName !== undefined ? { tableName } : {}),
  });

  postgresRuntime = {
    key,
    provider,
    embeddingModel,
    tableName: tableName ?? "companion_memories",
  };

  return postgresRuntime;
}

/**
 * 仅检测健康，不替换聊天链路用的 provider。供 /api/memory-health 使用。
 */
export async function inspectMemoryHealth(
  env: NodeJS.ProcessEnv,
  modelConfig: CreateModelOptions,
): Promise<MemoryRuntime> {
  const runtime = resolvePostgresRuntime(env, modelConfig);

  if (runtime === undefined) {
    return {
      provider: inMemoryDemoMemory,
      status: "disabled",
      reason: "DATABASE_URL is missing",
    };
  }

  const health = await runtime.provider.healthCheck();

  if (health.ok) {
    return {
      provider: runtime.provider,
      status: "connected",
      embeddingModel: runtime.embeddingModel,
      tableName: runtime.tableName,
      health,
    };
  }

  return {
    provider: noopDemoMemory,
    status: "error",
    embeddingModel: runtime.embeddingModel,
    tableName: runtime.tableName,
    health,
    reason: health.error ?? "memory database health check failed",
  };
}

/**
 * 为聊天请求选择 memory provider（patch-0 §8.2 严格 fallback）。
 * 与 inspectMemoryHealth 共享同一健康判断，确保 chat 与 health 面板一致。
 */
export async function resolveChatMemoryRuntime(
  env: NodeJS.ProcessEnv,
  modelConfig: CreateModelOptions,
): Promise<MemoryRuntime> {
  return inspectMemoryHealth(env, modelConfig);
}
