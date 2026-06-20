import type { Pool } from "pg";

import type {
  EmbeddingProvider,
  MemoryImportance,
  MemoryRecord,
  MemoryScope,
  MemorySource,
  MemoryType,
} from "@ying-companion/ai-core";
import { OpenAIEmbeddingProvider } from "@ying-companion/memory-postgres";

import { createId, getDebugPool } from "./debug-db";
import { LOCAL_DEBUG_OWNER } from "./debug-owner";
import { readMemoryEnvConfig } from "./memory-config";

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
}

export interface MemoryCreateInput {
  type: MemoryType;
  content: string;
  importance: MemoryImportance;
}

export interface MemoryUpdateInput {
  type?: MemoryType;
  content?: string;
  importance?: MemoryImportance;
}

export class CompanionMemoryAdminRepository {
  private readonly pool: Pool;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly tableName: string;

  public constructor(options?: {
    pool?: Pool;
    embeddingProvider?: EmbeddingProvider;
    tableName?: string;
  }) {
    const config = readMemoryEnvConfig(process.env);

    this.pool = options?.pool ?? getDebugPool();
    this.embeddingProvider =
      options?.embeddingProvider ??
      new OpenAIEmbeddingProvider({
        apiKey: config.apiKey ?? "",
        model: config.embeddingModel,
        ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
      });
    this.tableName = validateTableName(options?.tableName ?? config.tableName);
  }

  public async list(scope: MemoryScope): Promise<MemoryRecord[]> {
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
          updated_at
        FROM ${this.tableName}
        WHERE owner_type = $1
          AND owner_id = $2
          AND companion_id IS NOT DISTINCT FROM $3
        ORDER BY updated_at DESC, created_at DESC
      `,
      [scope.ownerType, scope.ownerId, scope.companionId ?? null],
    );

    return result.rows.map(rowToMemoryRecord);
  }

  public async create(input: MemoryCreateInput, scope: MemoryScope): Promise<MemoryRecord> {
    const normalized = normalizeCreateInput(input);
    const duplicate = await this.hasDuplicate(scope, normalized.type, normalized.content);

    if (duplicate) {
      throw new Error("memory with same type and content already exists in this scope");
    }

    const embedding = await this.embeddingProvider.embed({ text: normalized.content });
    const result = await this.pool.query<MemoryRow>(
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
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9)
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
        createId("memory"),
        scope.ownerType,
        scope.ownerId,
        scope.companionId ?? null,
        normalized.type,
        normalized.content,
        normalized.importance,
        toPgVector(embedding.vector),
        JSON.stringify({ createdBy: "debug-memory-admin" }),
      ],
    );

    return rowToMemoryRecord(requireRow(result.rows[0]));
  }

  public async update(
    id: string,
    patch: MemoryUpdateInput,
    scope: MemoryScope,
  ): Promise<MemoryRecord> {
    const existing = await this.get(id, scope);

    if (existing === null) {
      throw new Error("memory not found");
    }

    const content = patch.content !== undefined ? patch.content.trim() : existing.content;
    const type = patch.type ?? existing.type;
    const importance = patch.importance ?? existing.importance;

    if (content === "") {
      throw new Error("content is required");
    }

    const contentChanged = content !== existing.content;
    const embedding = contentChanged ? await this.embeddingProvider.embed({ text: content }) : null;
    const result = await this.pool.query<MemoryRow>(
      `
        UPDATE ${this.tableName}
        SET
          type = $5,
          content = $6,
          importance = $7,
          embedding = CASE WHEN $8::vector IS NULL THEN embedding ELSE $8::vector END,
          updated_at = NOW()
        WHERE id = $1
          AND owner_type = $2
          AND owner_id = $3
          AND companion_id IS NOT DISTINCT FROM $4
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
        scope.ownerType,
        scope.ownerId,
        scope.companionId ?? null,
        type,
        content,
        normalizeImportance(importance),
        embedding !== null ? toPgVector(embedding.vector) : null,
      ],
    );

    return rowToMemoryRecord(requireRow(result.rows[0], "memory not found"));
  }

  public async remove(id: string, scope: MemoryScope): Promise<boolean> {
    const result = await this.pool.query(
      `
        DELETE FROM ${this.tableName}
        WHERE id = $1
          AND owner_type = $2
          AND owner_id = $3
          AND companion_id IS NOT DISTINCT FROM $4
      `,
      [id, scope.ownerType, scope.ownerId, scope.companionId ?? null],
    );

    return (result.rowCount ?? 0) > 0;
  }

  private async get(id: string, scope: MemoryScope): Promise<MemoryRecord | null> {
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
          updated_at
        FROM ${this.tableName}
        WHERE id = $1
          AND owner_type = $2
          AND owner_id = $3
          AND companion_id IS NOT DISTINCT FROM $4
      `,
      [id, scope.ownerType, scope.ownerId, scope.companionId ?? null],
    );

    return result.rows[0] !== undefined ? rowToMemoryRecord(result.rows[0]) : null;
  }

  private async hasDuplicate(
    scope: MemoryScope,
    type: MemoryType,
    content: string,
  ): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM ${this.tableName}
          WHERE owner_type = $1
            AND owner_id = $2
            AND companion_id IS NOT DISTINCT FROM $3
            AND type = $4
            AND content = $5
        ) AS exists
      `,
      [scope.ownerType, scope.ownerId, scope.companionId ?? null, type, content],
    );

    return result.rows[0]?.exists ?? false;
  }
}

export function createCompanionMemoryScope(companionId: string): MemoryScope {
  return {
    ownerType: LOCAL_DEBUG_OWNER.type,
    ownerId: LOCAL_DEBUG_OWNER.id,
    companionId,
  };
}

export function normalizeMemoryPayload(raw: unknown): MemoryCreateInput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("request body must be an object");
  }

  const body = raw as Record<string, unknown>;

  return normalizeCreateInput({
    type: normalizeMemoryType(body.type),
    content: typeof body.content === "string" ? body.content : "",
    importance: normalizeImportance(body.importance),
  });
}

export function normalizeMemoryPatch(raw: unknown): MemoryUpdateInput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("request body must be an object");
  }

  const body = raw as Record<string, unknown>;
  const patch: MemoryUpdateInput = {};

  if (body.type !== undefined) {
    patch.type = normalizeMemoryType(body.type);
  }
  if (body.content !== undefined) {
    if (typeof body.content !== "string") {
      throw new Error("content must be a string");
    }
    patch.content = body.content;
  }
  if (body.importance !== undefined) {
    patch.importance = normalizeImportance(body.importance);
  }

  return patch;
}

function normalizeCreateInput(input: MemoryCreateInput): MemoryCreateInput {
  const content = input.content.trim();

  if (content === "") {
    throw new Error("content is required");
  }

  return {
    type: input.type,
    content,
    importance: normalizeImportance(input.importance),
  };
}

function normalizeMemoryType(value: unknown): MemoryType {
  const allowed: MemoryType[] = ["fact", "preference", "relationship", "event"];

  if (allowed.includes(value as MemoryType)) {
    return value as MemoryType;
  }

  return "fact";
}

function normalizeImportance(value: unknown): MemoryImportance {
  const parsed = typeof value === "number" ? value : Number(value);
  const rounded = Math.round(Number.isFinite(parsed) ? parsed : 3);

  return Math.min(5, Math.max(1, rounded)) as MemoryImportance;
}

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

function toPgVector(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

function validateTableName(tableName: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
    throw new Error("tableName must be a simple SQL identifier");
  }

  return tableName;
}

function requireRow<T>(row: T | undefined, message = "database write returned no row"): T {
  if (row === undefined) {
    throw new Error(message);
  }

  return row;
}
