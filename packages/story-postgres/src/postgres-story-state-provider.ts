import type { StoryState, StoryStateProvider } from "@ying-ai/story-core";
import type { StoryPostgresClient } from "./client";
import { deserializeStoryDefinition } from "./serializers/story-definition-serializer";
import { deserializeStoryState, serializeStoryState } from "./serializers/story-state-serializer";

interface StoryStateRow {
  state_json: unknown;
}

interface StorySessionDefinitionRow {
  definition_snapshot: unknown;
}

export class PostgresStoryStateProvider implements StoryStateProvider {
  constructor(private readonly client: StoryPostgresClient) {}

  async getState(sessionId: string): Promise<StoryState | null> {
    const result = await this.client.query<StoryStateRow>(
      `SELECT state_json FROM story_states WHERE session_id = $1`,
      [sessionId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const definitionResult = await this.client.query<StorySessionDefinitionRow>(
      `SELECT definition_snapshot FROM story_sessions WHERE id = $1`,
      [sessionId],
    );
    const definitionRow = definitionResult.rows[0];
    if (!definitionRow) {
      throw new Error(`Story session ${sessionId} does not exist`);
    }
    return deserializeStoryState(
      row.state_json,
      deserializeStoryDefinition(definitionRow.definition_snapshot),
    );
  }

  async saveState(
    sessionId: string,
    state: StoryState,
    options?: { expectedRevision?: number },
  ): Promise<void> {
    const result = await this.client.query(
      `UPDATE story_states
       SET state_json = $2, revision = $3, updated_at = $4
       WHERE session_id = $1
         AND ($5::bigint IS NULL OR revision = $5::bigint)`,
      [
        sessionId,
        JSON.stringify(serializeStoryState(state)),
        state.revision,
        state.updatedAt,
        options?.expectedRevision ?? null,
      ],
    );
    if (options?.expectedRevision !== undefined && result.rowCount !== 1) {
      throw new Error(`Story state revision conflict for session ${sessionId}`);
    }
  }
}
