import { Pool } from "pg";

import { readOptionalEnv } from "./model-config";

let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

const ENSURE_PERSONA_PROFILE_COLUMNS_SQL = `
ALTER TABLE debug_companions
  ADD COLUMN IF NOT EXISTS user_address TEXT;

ALTER TABLE debug_companions
  ADD COLUMN IF NOT EXISTS user_display_name TEXT,
  ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS appearance JSONB NOT NULL DEFAULT '{}'::jsonb;
`;

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

/** Idempotent schema backfill for databases created before V1.1 Persona Profile. */
export async function ensureDebugWorkspaceSchema(pool: Pool = getDebugPool()): Promise<void> {
  if (schemaReady === undefined) {
    schemaReady = pool.query(ENSURE_PERSONA_PROFILE_COLUMNS_SQL).then(
      () => undefined,
      (error: unknown) => {
        schemaReady = undefined;
        throw error;
      },
    );
  }

  await schemaReady;
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
