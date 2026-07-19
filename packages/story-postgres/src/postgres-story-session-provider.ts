import type { StoryProvider, StorySession, StorySessionProvider } from "@ying-companion/story-core";
import { initializeStoryState, validateStoryDefinition } from "@ying-companion/story-core";
import type { StoryPostgresClient } from "./client";
import { withTransaction } from "./client";
import {
  deserializeStoryDefinition,
  serializeStoryDefinition,
} from "./serializers/story-definition-serializer";
import { serializeStoryState } from "./serializers/story-state-serializer";

export interface PostgresStorySessionProviderOptions {
  client: StoryPostgresClient;
  storyProvider: StoryProvider;
  idFactory?: () => string;
  now?: () => Date;
}

interface StorySessionRow {
  id: string;
  story_id: string;
  definition_version: string;
  definition_snapshot: unknown;
  created_at: Date;
  updated_at: Date;
}

export class PostgresStorySessionProvider implements StorySessionProvider {
  private readonly idFactory: () => string;
  private readonly now: () => Date;

  constructor(private readonly options: PostgresStorySessionProviderOptions) {
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => new Date());
  }

  async createSession(input: { storyId: string }): Promise<StorySession> {
    const definition = await this.options.storyProvider.getDefinition(input.storyId);
    if (!definition) {
      throw new Error(`Story definition ${input.storyId} does not exist`);
    }
    const validation = validateStoryDefinition(definition);
    if (!validation.valid) {
      throw new Error(
        `Story definition is invalid: ${validation.errors.map((error) => error.message).join("; ")}`,
      );
    }

    const now = this.now();
    const state = initializeStoryState(definition, now);
    const session: StorySession = {
      id: this.idFactory(),
      storyId: definition.id,
      definitionSnapshot: deserializeStoryDefinition(serializeStoryDefinition(definition)),
      definitionVersion: definition.version,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await withTransaction(this.options.client, async (tx) => {
      await tx.query(
        `INSERT INTO story_sessions
          (id, story_id, definition_version, definition_snapshot, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          session.id,
          session.storyId,
          session.definitionVersion,
          JSON.stringify(serializeStoryDefinition(session.definitionSnapshot)),
          now,
          now,
        ],
      );
      await tx.query(
        `INSERT INTO story_states
          (session_id, schema_version, state_json, revision, updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          session.id,
          state.schemaVersion,
          JSON.stringify(serializeStoryState(state)),
          state.revision,
          now,
        ],
      );
    });

    return session;
  }

  async getSession(sessionId: string): Promise<StorySession | null> {
    const result = await this.options.client.query<StorySessionRow>(
      `SELECT id, story_id, definition_version, definition_snapshot, created_at, updated_at
       FROM story_sessions
       WHERE id = $1`,
      [sessionId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      storyId: row.story_id,
      definitionVersion: row.definition_version,
      definitionSnapshot: deserializeStoryDefinition(row.definition_snapshot),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
