import type {
  CommittedStoryTurn,
  RecalledLoreEntry,
  StoryTurnPlan,
  StoryTurn,
  StoryTurnRepository,
} from "@ying-ai/story-core";
import type { StoryPostgresClient } from "./client";

interface StoryTurnRow {
  id: string;
  session_id: string;
  turn_number: number;
  client_turn_id: string;
  status: "committed" | "failed" | "processing";
  user_text: string;
  assistant_text: string | null;
  plan_json: unknown;
  recalled_lore_json: unknown;
  previous_state_revision: string;
  next_state_revision: string | null;
  state_changed: boolean;
  error_json: { code?: string; message?: string } | null;
  created_at: Date;
  committed_at: Date | null;
}

export class PostgresStoryTurnRepository implements StoryTurnRepository {
  constructor(private readonly client: StoryPostgresClient) {}

  async getByClientTurnId(sessionId: string, clientTurnId: string): Promise<StoryTurn | null> {
    const result = await this.client.query<StoryTurnRow>(
      `SELECT * FROM story_turns WHERE session_id = $1 AND client_turn_id = $2`,
      [sessionId, clientTurnId],
    );
    return result.rows[0] ? mapTurn(result.rows[0]) : null;
  }

  async getCommittedByClientTurnId(
    sessionId: string,
    clientTurnId: string,
  ): Promise<CommittedStoryTurn | null> {
    const turn = await this.getByClientTurnId(sessionId, clientTurnId);
    return turn?.status === "committed" ? turn : null;
  }

  async getCommittedTurns(
    sessionId: string,
    options?: { afterTurnNumber?: number; limit?: number },
  ): Promise<CommittedStoryTurn[]> {
    const result = await this.client.query<StoryTurnRow>(
      `SELECT * FROM story_turns
       WHERE session_id = $1
         AND status = 'committed'
         AND turn_number > $2
       ORDER BY turn_number ASC
       LIMIT $3`,
      [sessionId, options?.afterTurnNumber ?? 0, options?.limit ?? 100],
    );
    return result.rows
      .map(mapTurn)
      .filter((turn): turn is CommittedStoryTurn => turn.status === "committed");
  }
}

export function mapTurn(row: StoryTurnRow): StoryTurn {
  if (row.status === "committed") {
    return {
      id: row.id,
      sessionId: row.session_id,
      turnNumber: row.turn_number,
      clientTurnId: row.client_turn_id,
      status: "committed",
      userInput: row.user_text,
      assistantText: row.assistant_text ?? "",
      plan: row.plan_json as CommittedStoryTurn["plan"],
      recalledLore: (row.recalled_lore_json ?? []) as CommittedStoryTurn["recalledLore"],
      previousStateRevision: Number(row.previous_state_revision),
      nextStateRevision: Number(row.next_state_revision),
      stateChanged: row.state_changed,
      createdAt: row.created_at.toISOString(),
      committedAt: (row.committed_at ?? row.created_at).toISOString(),
    };
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    turnNumber: row.turn_number,
    clientTurnId: row.client_turn_id,
    status: "failed",
    userInput: row.user_text,
    ...(row.assistant_text ? { assistantText: row.assistant_text } : {}),
    ...(row.plan_json ? { plan: row.plan_json as StoryTurnPlan } : {}),
    ...(row.recalled_lore_json
      ? { recalledLore: row.recalled_lore_json as RecalledLoreEntry[] }
      : {}),
    previousStateRevision: Number(row.previous_state_revision),
    ...(row.next_state_revision ? { nextStateRevision: Number(row.next_state_revision) } : {}),
    error: {
      code: row.error_json?.code ?? "UNKNOWN",
      message: row.error_json?.message ?? "Unknown story turn failure",
    },
    createdAt: row.created_at.toISOString(),
    ...(row.committed_at ? { committedAt: row.committed_at.toISOString() } : {}),
  };
}
