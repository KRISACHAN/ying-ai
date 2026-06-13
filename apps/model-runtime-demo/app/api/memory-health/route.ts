import { loadModelConfig } from "../../lib/model-config";
import { inspectMemoryHealth, type MemoryDatabaseStatus } from "../../lib/memory-config";

import type { MemoryDatabaseHealth } from "@ying-companion/memory-postgres";

interface MemoryHealthResponse {
  ok: boolean;
  status: MemoryDatabaseStatus;
  provider: {
    id: string;
    kind: string;
    name: string;
    description?: string;
    version?: string;
  };
  embeddingModel?: string;
  tableName?: string;
  reason?: string;
  health?: MemoryDatabaseHealth;
  error?: { message: string };
}

/**
 * patch-0 §8/§11.4：页面加载时调用，展示 DB / pgvector / provider 状态。
 * 不在 chat 请求路径中做重型检测。
 */
export async function GET(): Promise<Response> {
  try {
    const modelConfig = loadModelConfig(process.env);
    const runtime = await inspectMemoryHealth(process.env, modelConfig);

    const body: MemoryHealthResponse = {
      ok: runtime.status === "connected",
      status: runtime.status,
      provider: {
        id: runtime.provider.meta.id,
        kind: runtime.provider.meta.kind,
        name: runtime.provider.meta.name,
        ...(runtime.provider.meta.description !== undefined
          ? { description: runtime.provider.meta.description }
          : {}),
        ...(runtime.provider.meta.version !== undefined
          ? { version: runtime.provider.meta.version }
          : {}),
      },
      ...(runtime.embeddingModel !== undefined ? { embeddingModel: runtime.embeddingModel } : {}),
      ...(runtime.tableName !== undefined ? { tableName: runtime.tableName } : {}),
      ...(runtime.reason !== undefined ? { reason: runtime.reason } : {}),
      ...(runtime.health !== undefined ? { health: runtime.health } : {}),
    };

    return jsonResponse(body);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        status: "error",
        provider: { id: "memory.unknown", kind: "memory", name: "Unknown" },
        error: { message: error instanceof Error ? error.message : "memory health check failed" },
      },
      500,
    );
  }
}

function jsonResponse(body: MemoryHealthResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
