import type {
  StoryNarrativeSummary,
  StorySummaryProvider,
  StorySummaryUpdateInput,
} from "@ying-ai/story-core";
import type { StoryPostgresClient } from "./client";

interface StorySummaryRow {
  session_id: string;
  through_turn_number: number;
  version: string;
  summary_text: string;
  updated_at: Date;
}

export class PostgresStorySummaryProvider implements StorySummaryProvider {
  constructor(private readonly client: StoryPostgresClient) {}

  async getSummary(sessionId: string): Promise<StoryNarrativeSummary | null> {
    const result = await this.client.query<StorySummaryRow>(
      `SELECT session_id, through_turn_number, version, summary_text, updated_at
       FROM story_summaries
       WHERE session_id = $1`,
      [sessionId],
    );
    return result.rows[0] ? mapSummary(result.rows[0]) : null;
  }

  async updateSummary(input: StorySummaryUpdateInput): Promise<StoryNarrativeSummary> {
    const lastTurn = input.newlyCommittedTurns.at(-1);
    const sessionId = lastTurn?.sessionId ?? input.previousSummary?.sessionId;
    if (!sessionId) {
      throw new Error("Cannot update story summary without a session id");
    }
    const throughTurnNumber = lastTurn?.turnNumber ?? input.previousSummary?.throughTurnNumber ?? 0;
    const text = [
      input.previousSummary?.text,
      ...input.newlyCommittedTurns.map(
        (turn) => `Turn ${turn.turnNumber}: ${turn.userInput} -> ${turn.assistantText}`,
      ),
    ]
      .filter(Boolean)
      .join("\n");
    const now = input.now ?? new Date();
    const version = (input.previousSummary?.version ?? 0) + 1;
    const result = await this.client.query<StorySummaryRow>(
      `INSERT INTO story_summaries
        (session_id, through_turn_number, version, summary_text, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_id) DO UPDATE
       SET through_turn_number = EXCLUDED.through_turn_number,
           version = story_summaries.version + 1,
           summary_text = EXCLUDED.summary_text,
           updated_at = EXCLUDED.updated_at
       WHERE story_summaries.version = $6
       RETURNING session_id, through_turn_number, version, summary_text, updated_at`,
      [sessionId, throughTurnNumber, version, text, now, input.previousSummary?.version ?? 0],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`Story summary version conflict for session ${sessionId}`);
    }
    return mapSummary(row);
  }
}

function mapSummary(row: StorySummaryRow): StoryNarrativeSummary {
  return {
    sessionId: row.session_id,
    throughTurnNumber: row.through_turn_number,
    version: Number(row.version),
    text: row.summary_text,
    updatedAt: row.updated_at.toISOString(),
  };
}
