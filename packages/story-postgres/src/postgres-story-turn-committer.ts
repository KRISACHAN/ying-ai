import type {
  CommitSuccessfulStoryTurnInput,
  CommittedStoryTurn,
  StoryMessage,
  StoryTurnCommitter,
} from "@ying-ai/story-core";
import { StoryWorkflowError } from "@ying-ai/story-core";
import type { PoolClient } from "pg";
import type { StoryPostgresClient } from "./client";
import { withTransaction } from "./client";
import { serializeStoryState } from "./serializers/story-state-serializer";
import { mapTurn } from "./postgres-story-turn-repository";

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

export interface PostgresStoryTurnCommitterOptions {
  client: StoryPostgresClient;
  idFactory?: () => string;
}

export class PostgresStoryTurnCommitter implements StoryTurnCommitter {
  private readonly idFactory: () => string;

  constructor(private readonly options: PostgresStoryTurnCommitterOptions) {
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  async commitSuccessfulTurn(input: CommitSuccessfulStoryTurnInput): Promise<CommittedStoryTurn> {
    return withTransaction(this.options.client, async (tx) => {
      const existing = await tx.query<StoryTurnRow>(
        `SELECT * FROM story_turns
         WHERE session_id = $1 AND client_turn_id = $2
         FOR UPDATE`,
        [input.sessionId, input.clientTurnId],
      );
      const existingTurn = existing.rows[0];
      if (existingTurn?.status === "committed") {
        return mapTurn(existingTurn) as CommittedStoryTurn;
      }

      const stateResult = await tx.query<{ revision: string }>(
        `SELECT revision FROM story_states WHERE session_id = $1 FOR UPDATE`,
        [input.sessionId],
      );
      const currentRevision = Number(stateResult.rows[0]?.revision);
      if (currentRevision !== input.expectedStateRevision) {
        throw new StoryWorkflowError(
          "STORY_STATE_CONFLICT",
          `Story state revision conflict for session ${input.sessionId}`,
        );
      }

      const turnNumber = await nextTurnNumber(tx, input.sessionId);
      const now = input.now ?? new Date();
      const nextState = {
        ...input.nextState,
        revision: input.expectedStateRevision + 1,
        updatedAt: now.toISOString(),
      };
      const turnId = existingTurn?.id ?? this.idFactory();

      const committed = await tx.query<StoryTurnRow>(
        `INSERT INTO story_turns
          (id, session_id, turn_number, client_turn_id, status, user_text, assistant_text,
           plan_json, recalled_lore_json, previous_state_revision, next_state_revision,
           state_changed, error_json, created_at, committed_at)
         VALUES ($1, $2, $3, $4, 'committed', $5, $6, $7, $8, $9, $10, $11, NULL, $12, $12)
         ON CONFLICT (session_id, client_turn_id) DO UPDATE
         SET status = 'committed',
             user_text = EXCLUDED.user_text,
             assistant_text = EXCLUDED.assistant_text,
             plan_json = EXCLUDED.plan_json,
             recalled_lore_json = EXCLUDED.recalled_lore_json,
             previous_state_revision = EXCLUDED.previous_state_revision,
             next_state_revision = EXCLUDED.next_state_revision,
             state_changed = EXCLUDED.state_changed,
             error_json = NULL,
             committed_at = EXCLUDED.committed_at
         WHERE story_turns.status = 'failed'
         RETURNING *`,
        [
          turnId,
          input.sessionId,
          turnNumber,
          input.clientTurnId,
          input.userInput,
          input.assistantText,
          JSON.stringify(input.plan),
          JSON.stringify(input.recalledLore),
          input.expectedStateRevision,
          nextState.revision,
          input.stateChanged,
          now,
        ],
      );
      const row = committed.rows[0];
      if (!row) {
        throw new StoryWorkflowError(
          "STORY_STATE_CONFLICT",
          `Story turn ${input.clientTurnId} could not be committed`,
        );
      }

      await insertMessages(tx, {
        idFactory: this.idFactory,
        sessionId: input.sessionId,
        turnId: row.id,
        turnNumber: row.turn_number,
        userInput: input.userInput,
        assistantText: input.assistantText,
        now,
      });

      const updated = await tx.query(
        `UPDATE story_states
         SET state_json = $2,
             revision = revision + 1,
             updated_at = $3
         WHERE session_id = $1
           AND revision = $4`,
        [
          input.sessionId,
          JSON.stringify(serializeStoryState(nextState)),
          now,
          input.expectedStateRevision,
        ],
      );
      if (updated.rowCount !== 1) {
        throw new StoryWorkflowError(
          "STORY_STATE_CONFLICT",
          `Story state revision conflict for session ${input.sessionId}`,
        );
      }
      await tx.query(`UPDATE story_sessions SET updated_at = $2 WHERE id = $1`, [
        input.sessionId,
        now,
      ]);

      return mapTurn(row) as CommittedStoryTurn;
    });
  }
}

async function nextTurnNumber(tx: PoolClient, sessionId: string): Promise<number> {
  const result = await tx.query<{ next_turn_number: number }>(
    `SELECT COALESCE(MAX(turn_number), 0) + 1 AS next_turn_number
     FROM story_turns
     WHERE session_id = $1`,
    [sessionId],
  );
  return result.rows[0]?.next_turn_number ?? 1;
}

async function insertMessages(
  tx: PoolClient,
  input: {
    idFactory: () => string;
    sessionId: string;
    turnId: string;
    turnNumber: number;
    userInput: string;
    assistantText: string;
    now: Date;
  },
): Promise<void> {
  const messages: StoryMessage[] = [
    {
      id: input.idFactory(),
      sessionId: input.sessionId,
      turnId: input.turnId,
      role: "user",
      content: input.userInput,
      sequence: input.turnNumber * 2 - 1,
      createdAt: input.now.toISOString(),
    },
    {
      id: input.idFactory(),
      sessionId: input.sessionId,
      turnId: input.turnId,
      role: "assistant",
      content: input.assistantText,
      sequence: input.turnNumber * 2,
      createdAt: input.now.toISOString(),
    },
  ];
  for (const message of messages) {
    await tx.query(
      `INSERT INTO story_messages
        (id, session_id, turn_id, role, content, sequence, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (turn_id, role) DO UPDATE
       SET content = EXCLUDED.content,
           sequence = EXCLUDED.sequence,
           created_at = EXCLUDED.created_at`,
      [
        message.id,
        message.sessionId,
        message.turnId,
        message.role,
        message.content,
        message.sequence,
        input.now,
      ],
    );
  }
}
