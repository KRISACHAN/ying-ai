import { Pool } from "pg";

import { readOptionalEnv } from "./model-config";

let pool: Pool | undefined;

export function getDebugPool(env: NodeJS.ProcessEnv = process.env): Pool {
  const connectionString = readOptionalEnv(env, "DATABASE_URL");

  if (connectionString === undefined) {
    throw new Error("DATABASE_URL is required for the Stage 8 debug workspace");
  }

  if (pool === undefined) {
    pool = new Pool({ connectionString });
  }

  return pool;
}

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
