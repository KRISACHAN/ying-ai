import type { StoryMessage, StoryMessageProvider } from "@ying-ai/story-core";
import type { StoryPostgresClient } from "./client";

interface StoryMessageRow {
  id: string;
  session_id: string;
  turn_id: string;
  role: "user" | "assistant";
  content: string;
  sequence: number;
  created_at: Date;
}

export class PostgresStoryMessageProvider implements StoryMessageProvider {
  constructor(private readonly client: StoryPostgresClient) {}

  async getRecentMessages(
    sessionId: string,
    options?: { limit?: number; beforeTurnNumber?: number },
  ): Promise<StoryMessage[]> {
    const limit = options?.limit ?? 20;
    const result = await this.client.query<StoryMessageRow>(
      `SELECT m.id, m.session_id, m.turn_id, m.role, m.content, m.sequence, m.created_at
       FROM story_messages m
       JOIN story_turns t ON t.id = m.turn_id
       WHERE m.session_id = $1
         AND t.status = 'committed'
         AND ($2::integer IS NULL OR t.turn_number < $2)
       ORDER BY t.turn_number DESC, m.sequence DESC
       LIMIT $3`,
      [sessionId, options?.beforeTurnNumber ?? null, limit],
    );
    return result.rows.reverse().map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      turnId: row.turn_id,
      role: row.role,
      content: row.content,
      sequence: row.sequence,
      createdAt: row.created_at.toISOString(),
    }));
  }
}
