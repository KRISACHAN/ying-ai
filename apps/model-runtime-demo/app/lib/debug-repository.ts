import type { Pool, PoolClient } from "pg";

import type {
  ChatMessage,
  ChatWorkflowOutput,
  CompanionGender,
  ConversationSummary,
  EmotionState,
  MemoryScope,
  SummaryProvider,
  SummarySaveInput,
  SummarySaveResult,
  SummaryScope,
} from "@ying-companion/ai-core";

import { createId, ensureDebugWorkspaceSchema, getDebugPool, toSafeErrorMessage } from "./debug-db";
import { LOCAL_DEBUG_OWNER } from "./debug-owner";
import type {
  ConversationDetail,
  DebugCompanion,
  DebugConversation,
  DebugConversationListItem,
  DebugMessage,
  MessageRole,
  MessageStatus,
  SerializedCoreEvent,
  WorkflowRunDetail,
  WorkflowRunListItem,
  WorkflowRunStatus,
} from "./debug-types";

const MAX_HISTORY_LENGTH = 50;
const VALID_GENDERS: CompanionGender[] = ["female", "male", "non_binary", "unknown"];
const VALID_MEMORY_TYPES = ["preference", "fact", "relationship", "event", "note"] as const;

interface CompanionRow {
  id: string;
  name: string;
  gender: CompanionGender;
  relationship: string | null;
  user_display_name: string | null;
  user_address: string | null;
  profile: unknown;
  appearance: unknown;
  personality: string;
  speaking_style: string | null;
  background: string | null;
  custom_instructions: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ConversationRow {
  id: string;
  companion_id: string;
  title: string;
  last_message_preview: string | null;
  emotion_json: EmotionState | null;
  created_at: Date;
  updated_at: Date;
}

interface ConversationListRow extends ConversationRow {
  companion_name: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  error_summary: string | null;
  model: string | null;
  created_at: Date;
}

interface SummaryRow {
  conversation_id: string;
  owner_type: MemoryScope["ownerType"];
  owner_id: string;
  companion_id: string;
  summary_content: string;
  covered_message_count: number;
  metadata: Record<string, unknown> | null;
  updated_at: Date;
}

interface RunRow {
  id: string;
  conversation_id: string;
  user_message_id: string;
  assistant_message_id: string | null;
  workflow_id: string | null;
  status: WorkflowRunStatus;
  model: string | null;
  trace_json: unknown;
  observer_events_json: SerializedCoreEvent[] | null;
  debug_context_json: unknown;
  memory_snapshot_json: unknown;
  emotion_snapshot_json: unknown;
  tool_snapshot_json: unknown;
  error_summary: string | null;
  created_at: Date;
}

export interface CompanionFormInput {
  name: string;
  gender: CompanionGender;
  relationship?: string;
  userDisplayName?: string;
  userAddress?: string;
  hobbies?: string[];
  heightCm?: number;
  weightKg?: number;
  hair?: string;
  bodyType?: string;
  additionalTraits?: Record<string, string>;
  personality: string;
  speakingStyle?: string;
  background?: string;
  customInstructions?: string;
}

interface NormalizedCompanionInput {
  name: string;
  gender: CompanionGender;
  relationship: string;
  userDisplayName: string;
  userAddress: string;
  profile: DebugCompanion["profile"];
  appearance: DebugCompanion["appearance"];
  personality: string;
  speakingStyle: string;
  background: string;
  customInstructions: string;
}

export class DebugRepository {
  private readonly pool: Pool;

  public constructor(pool = getDebugPool()) {
    this.pool = pool;
  }

  private async ready(): Promise<void> {
    await ensureDebugWorkspaceSchema(this.pool);
  }

  public async listCompanions(): Promise<DebugCompanion[]> {
    await this.ready();
    const result = await this.pool.query<CompanionRow>(
      `
        SELECT *
        FROM debug_companions
        WHERE owner_type = $1 AND owner_id = $2
        ORDER BY updated_at DESC
      `,
      [LOCAL_DEBUG_OWNER.type, LOCAL_DEBUG_OWNER.id],
    );

    return result.rows.map(rowToCompanion);
  }

  public async getCompanion(id: string): Promise<DebugCompanion | null> {
    await this.ready();
    const result = await this.pool.query<CompanionRow>(
      `
        SELECT *
        FROM debug_companions
        WHERE owner_type = $1 AND owner_id = $2 AND id = $3
      `,
      [LOCAL_DEBUG_OWNER.type, LOCAL_DEBUG_OWNER.id, id],
    );

    return result.rows[0] !== undefined ? rowToCompanion(result.rows[0]) : null;
  }

  public async createCompanion(input: CompanionFormInput): Promise<DebugCompanion> {
    await this.ready();
    const normalized = normalizeCompanionInput(input);
    const id = createId("companion");
    const result = await this.pool.query<CompanionRow>(
      `
        INSERT INTO debug_companions (
          id,
          owner_type,
          owner_id,
          name,
          gender,
          relationship,
          user_display_name,
          user_address,
          profile,
          appearance,
          personality,
          speaking_style,
          background,
          custom_instructions
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14)
        RETURNING *
      `,
      [
        id,
        LOCAL_DEBUG_OWNER.type,
        LOCAL_DEBUG_OWNER.id,
        normalized.name,
        normalized.gender,
        normalized.relationship,
        normalized.userDisplayName,
        normalized.userAddress,
        toJsonParam(normalized.profile),
        toJsonParam(normalized.appearance),
        normalized.personality,
        normalized.speakingStyle,
        normalized.background,
        normalized.customInstructions,
      ],
    );

    return rowToCompanion(requireRow(result.rows[0]));
  }

  public async updateCompanion(id: string, input: CompanionFormInput): Promise<DebugCompanion> {
    await this.ready();
    const normalized = normalizeCompanionInput(input);
    const result = await this.pool.query<CompanionRow>(
      `
        UPDATE debug_companions
        SET
          name = $4,
          gender = $5,
          relationship = $6,
          user_display_name = $7,
          user_address = $8,
          profile = $9::jsonb,
          appearance = $10::jsonb,
          personality = $11,
          speaking_style = $12,
          background = $13,
          custom_instructions = $14,
          updated_at = NOW()
        WHERE owner_type = $1 AND owner_id = $2 AND id = $3
        RETURNING *
      `,
      [
        LOCAL_DEBUG_OWNER.type,
        LOCAL_DEBUG_OWNER.id,
        id,
        normalized.name,
        normalized.gender,
        normalized.relationship,
        normalized.userDisplayName,
        normalized.userAddress,
        toJsonParam(normalized.profile),
        toJsonParam(normalized.appearance),
        normalized.personality,
        normalized.speakingStyle,
        normalized.background,
        normalized.customInstructions,
      ],
    );

    return rowToCompanion(requireRow(result.rows[0], "companion not found"));
  }

  public async listConversations(): Promise<DebugConversationListItem[]> {
    const result = await this.pool.query<ConversationListRow>(
      `
        SELECT c.*, p.name AS companion_name
        FROM debug_conversations c
        JOIN debug_companions p ON p.id = c.companion_id
        WHERE c.owner_type = $1 AND c.owner_id = $2
        ORDER BY c.updated_at DESC
      `,
      [LOCAL_DEBUG_OWNER.type, LOCAL_DEBUG_OWNER.id],
    );

    return result.rows.map((row) => ({
      ...rowToConversation(row),
      companionName: row.companion_name,
    }));
  }

  public async createConversation(companionId: string): Promise<DebugConversation> {
    const companion = await this.getCompanion(companionId);

    if (companion === null) {
      throw new Error("companion not found");
    }

    const id = createId("conversation");
    const result = await this.pool.query<ConversationRow>(
      `
        INSERT INTO debug_conversations (id, owner_type, owner_id, companion_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [id, LOCAL_DEBUG_OWNER.type, LOCAL_DEBUG_OWNER.id, companionId],
    );

    return rowToConversation(requireRow(result.rows[0]));
  }

  public async getConversationDetail(id: string): Promise<ConversationDetail | null> {
    const conversation = await this.getConversation(id);

    if (conversation === null) {
      return null;
    }

    const companion = await this.getCompanion(conversation.companionId);

    if (companion === null) {
      return null;
    }

    const [messages, summary] = await Promise.all([
      this.listMessages(id),
      this.loadSummary({
        ownerType: LOCAL_DEBUG_OWNER.type,
        ownerId: LOCAL_DEBUG_OWNER.id,
        companionId: companion.id,
        conversationId: id,
      }),
    ]);

    return {
      conversation,
      companion,
      messages,
      summary,
    };
  }

  public async deleteConversation(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        DELETE FROM debug_conversations
        WHERE owner_type = $1 AND owner_id = $2 AND id = $3
      `,
      [LOCAL_DEBUG_OWNER.type, LOCAL_DEBUG_OWNER.id, id],
    );

    return (result.rowCount ?? 0) > 0;
  }

  public async listMessages(conversationId: string): Promise<DebugMessage[]> {
    const result = await this.pool.query<MessageRow>(
      `
        SELECT m.*
        FROM debug_messages m
        JOIN debug_conversations c ON c.id = m.conversation_id
        WHERE c.owner_type = $1 AND c.owner_id = $2 AND m.conversation_id = $3
        ORDER BY m.created_at ASC
      `,
      [LOCAL_DEBUG_OWNER.type, LOCAL_DEBUG_OWNER.id, conversationId],
    );

    return result.rows.map(rowToMessage);
  }

  public async getCompletedHistory(conversationId: string): Promise<ChatMessage[]> {
    const result = await this.pool.query<MessageRow>(
      `
        SELECT m.*
        FROM debug_messages m
        JOIN debug_conversations c ON c.id = m.conversation_id
        WHERE c.owner_type = $1
          AND c.owner_id = $2
          AND m.conversation_id = $3
          AND m.status = 'completed'
        ORDER BY m.created_at DESC
        LIMIT $4
      `,
      [LOCAL_DEBUG_OWNER.type, LOCAL_DEBUG_OWNER.id, conversationId, MAX_HISTORY_LENGTH],
    );

    return result.rows
      .reverse()
      .map((message) => ({ role: message.role, content: message.content }));
  }

  public async createPendingRun(input: {
    conversationId: string;
    message: string;
  }): Promise<{ userMessage: DebugMessage; run: WorkflowRunDetail }> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const conversation = await this.getConversationForUpdate(client, input.conversationId);

      if (conversation === null) {
        throw new Error("conversation not found");
      }

      const userMessageId = createId("message");
      const runId = createId("run");
      const userMessage = await client.query<MessageRow>(
        `
          INSERT INTO debug_messages (id, conversation_id, role, content, status)
          VALUES ($1, $2, 'user', $3, 'pending')
          RETURNING *
        `,
        [userMessageId, input.conversationId, input.message],
      );
      const run = await client.query<RunRow>(
        `
          INSERT INTO debug_workflow_runs (id, conversation_id, user_message_id, status)
          VALUES ($1, $2, $3, 'running')
          RETURNING *
        `,
        [runId, input.conversationId, userMessageId],
      );

      await client.query("COMMIT");

      return {
        userMessage: rowToMessage(requireRow(userMessage.rows[0])),
        run: rowToRunDetail(requireRow(run.rows[0])),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  public async completeRun(input: {
    conversationId: string;
    runId: string;
    userMessageId: string;
    output: ChatWorkflowOutput;
    observerEvents: SerializedCoreEvent[];
  }): Promise<{
    assistantMessage: DebugMessage;
    run: WorkflowRunDetail;
    conversation: DebugConversation;
  }> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const assistantMessageId = createId("message");
      const status = deriveRunStatus(input.output);
      const trace = input.output.metadata?.trace ?? null;
      const workflowId = trace?.workflowId ?? null;
      const debugContext = input.output.metadata?.debugContext ?? null;
      const memorySnapshot = pickMemorySnapshot(input.output);
      const emotionSnapshot = pickEmotionSnapshot(input.output);
      const toolSnapshot = pickToolSnapshot(input.output);
      const assistantMessage = await client.query<MessageRow>(
        `
          INSERT INTO debug_messages (id, conversation_id, role, content, status, model)
          VALUES ($1, $2, 'assistant', $3, 'completed', $4)
          RETURNING *
        `,
        [assistantMessageId, input.conversationId, input.output.text, input.output.model ?? null],
      );
      const run = await client.query<RunRow>(
        `
          UPDATE debug_workflow_runs
          SET
            assistant_message_id = $4,
            workflow_id = $5,
            status = $6,
            model = $7,
            trace_json = $8,
            observer_events_json = $9,
            debug_context_json = $10,
            memory_snapshot_json = $11,
            emotion_snapshot_json = $12,
            tool_snapshot_json = $13,
            error_summary = NULL
          WHERE id = $1 AND conversation_id = $2 AND user_message_id = $3
          RETURNING *
        `,
        [
          input.runId,
          input.conversationId,
          input.userMessageId,
          assistantMessageId,
          workflowId,
          status,
          input.output.model ?? null,
          toJsonParam(trace),
          toJsonParam(input.observerEvents),
          toJsonParam(debugContext),
          toJsonParam(memorySnapshot),
          toJsonParam(emotionSnapshot),
          toJsonParam(toolSnapshot),
        ],
      );

      await client.query(
        `
          UPDATE debug_messages
          SET status = 'completed'
          WHERE id = $1 AND conversation_id = $2
        `,
        [input.userMessageId, input.conversationId],
      );

      const conversation = await client.query<ConversationRow>(
        `
          UPDATE debug_conversations
          SET
            emotion_json = $3,
            last_message_preview = $4,
            title = CASE WHEN title = '新对话' THEN $5 ELSE title END,
            updated_at = NOW()
          WHERE owner_type = $1 AND owner_id = $2 AND id = $6
          RETURNING *
        `,
        [
          LOCAL_DEBUG_OWNER.type,
          LOCAL_DEBUG_OWNER.id,
          toJsonParam(input.output.emotion ?? null),
          previewText(input.output.text),
          titleFromMessage(input.output.text),
          input.conversationId,
        ],
      );

      await client.query("COMMIT");

      return {
        assistantMessage: rowToMessage(requireRow(assistantMessage.rows[0])),
        run: rowToRunDetail(requireRow(run.rows[0])),
        conversation: rowToConversation(requireRow(conversation.rows[0])),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  public async failRun(input: {
    conversationId: string;
    runId: string;
    userMessageId: string;
    error: unknown;
    observerEvents: SerializedCoreEvent[];
  }): Promise<WorkflowRunDetail> {
    const client = await this.pool.connect();
    const errorSummary = toSafeErrorMessage(input.error);

    try {
      await client.query("BEGIN");
      await client.query(
        `
          UPDATE debug_messages
          SET status = 'failed', error_summary = $3
          WHERE id = $1 AND conversation_id = $2
        `,
        [input.userMessageId, input.conversationId, errorSummary],
      );
      const run = await client.query<RunRow>(
        `
          UPDATE debug_workflow_runs
          SET
            status = 'failed',
            observer_events_json = $4,
            error_summary = $5,
            trace_json = $6,
            workflow_id = $7
          WHERE id = $1 AND conversation_id = $2 AND user_message_id = $3
          RETURNING *
        `,
        [
          input.runId,
          input.conversationId,
          input.userMessageId,
          toJsonParam(input.observerEvents),
          errorSummary,
          toJsonParam(findErrorTrace(input.observerEvents)),
          findErrorWorkflowId(input.observerEvents),
        ],
      );
      await client.query(
        `
          UPDATE debug_conversations
          SET updated_at = NOW()
          WHERE owner_type = $1 AND owner_id = $2 AND id = $3
        `,
        [LOCAL_DEBUG_OWNER.type, LOCAL_DEBUG_OWNER.id, input.conversationId],
      );
      await client.query("COMMIT");

      return rowToRunDetail(requireRow(run.rows[0]));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  public async markRunPersistenceFailure(input: {
    conversationId: string;
    runId: string;
    userMessageId: string;
    output: ChatWorkflowOutput;
    observerEvents: SerializedCoreEvent[];
    error: unknown;
  }): Promise<WorkflowRunDetail> {
    const errorSummary = toSafeErrorMessage(input.error);
    const trace = input.output.metadata?.trace ?? null;
    const workflowId = trace?.workflowId ?? null;
    const debugContext = input.output.metadata?.debugContext ?? null;
    const memorySnapshot = pickMemorySnapshot(input.output);
    const emotionSnapshot = pickEmotionSnapshot(input.output);
    const toolSnapshot = pickToolSnapshot(input.output);

    const result = await this.pool.query<RunRow>(
      `
        UPDATE debug_workflow_runs
        SET
          workflow_id = $4,
          status = 'failed',
          model = $5,
          trace_json = $6,
          observer_events_json = $7,
          debug_context_json = $8,
          memory_snapshot_json = $9,
          emotion_snapshot_json = $10,
          tool_snapshot_json = $11,
          error_summary = $12
        WHERE id = $1 AND conversation_id = $2 AND user_message_id = $3
        RETURNING *
      `,
      [
        input.runId,
        input.conversationId,
        input.userMessageId,
        workflowId,
        input.output.model ?? null,
        toJsonParam(trace),
        toJsonParam(input.observerEvents),
        toJsonParam(debugContext),
        toJsonParam(memorySnapshot),
        toJsonParam(emotionSnapshot),
        toJsonParam(toolSnapshot),
        errorSummary,
      ],
    );

    return rowToRunDetail(requireRow(result.rows[0]));
  }

  public async listRuns(conversationId: string): Promise<WorkflowRunListItem[]> {
    const result = await this.pool.query<RunRow>(
      `
        SELECT r.*
        FROM debug_workflow_runs r
        JOIN debug_conversations c ON c.id = r.conversation_id
        WHERE c.owner_type = $1 AND c.owner_id = $2 AND r.conversation_id = $3
        ORDER BY r.created_at DESC
      `,
      [LOCAL_DEBUG_OWNER.type, LOCAL_DEBUG_OWNER.id, conversationId],
    );

    return result.rows.map(rowToRunListItem);
  }

  public async getRun(conversationId: string, runId: string): Promise<WorkflowRunDetail | null> {
    const result = await this.pool.query<RunRow>(
      `
        SELECT r.*
        FROM debug_workflow_runs r
        JOIN debug_conversations c ON c.id = r.conversation_id
        WHERE c.owner_type = $1 AND c.owner_id = $2 AND r.conversation_id = $3 AND r.id = $4
      `,
      [LOCAL_DEBUG_OWNER.type, LOCAL_DEBUG_OWNER.id, conversationId, runId],
    );

    return result.rows[0] !== undefined ? rowToRunDetail(result.rows[0]) : null;
  }

  public async getRunByAssistantMessage(
    conversationId: string,
    assistantMessageId: string,
  ): Promise<WorkflowRunDetail | null> {
    const result = await this.pool.query<RunRow>(
      `
        SELECT r.*
        FROM debug_workflow_runs r
        JOIN debug_conversations c ON c.id = r.conversation_id
        WHERE c.owner_type = $1
          AND c.owner_id = $2
          AND r.conversation_id = $3
          AND r.assistant_message_id = $4
      `,
      [LOCAL_DEBUG_OWNER.type, LOCAL_DEBUG_OWNER.id, conversationId, assistantMessageId],
    );

    return result.rows[0] !== undefined ? rowToRunDetail(result.rows[0]) : null;
  }

  public async loadSummary(scope: SummaryScope): Promise<ConversationSummary | null> {
    if (scope.conversationId === undefined) {
      return null;
    }

    const result = await this.pool.query<SummaryRow>(
      `
        SELECT *
        FROM debug_conversation_summaries
        WHERE owner_type = $1
          AND owner_id = $2
          AND companion_id = $3
          AND conversation_id = $4
      `,
      [scope.ownerType, scope.ownerId, scope.companionId ?? "", scope.conversationId],
    );

    return result.rows[0] !== undefined ? rowToSummary(result.rows[0]) : null;
  }

  public async saveSummary(input: SummarySaveInput): Promise<SummarySaveResult> {
    const conversationId = input.scope.conversationId;

    if (conversationId === undefined) {
      return { summary: input.summary };
    }

    const result = await this.pool.query<SummaryRow>(
      `
        INSERT INTO debug_conversation_summaries (
          conversation_id,
          owner_type,
          owner_id,
          companion_id,
          summary_content,
          covered_message_count,
          metadata,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (conversation_id)
        DO UPDATE SET
          summary_content = EXCLUDED.summary_content,
          covered_message_count = EXCLUDED.covered_message_count,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING *
      `,
      [
        conversationId,
        input.scope.ownerType,
        input.scope.ownerId,
        input.scope.companionId ?? "",
        input.summary.content,
        input.summary.messageCount ?? 0,
        toJsonParam(input.summary.metadata ?? null),
      ],
    );

    return { summary: rowToSummary(requireRow(result.rows[0])) };
  }

  private async getConversation(id: string): Promise<DebugConversation | null> {
    const result = await this.pool.query<ConversationRow>(
      `
        SELECT *
        FROM debug_conversations
        WHERE owner_type = $1 AND owner_id = $2 AND id = $3
      `,
      [LOCAL_DEBUG_OWNER.type, LOCAL_DEBUG_OWNER.id, id],
    );

    return result.rows[0] !== undefined ? rowToConversation(result.rows[0]) : null;
  }

  private async getConversationForUpdate(
    client: PoolClient,
    id: string,
  ): Promise<DebugConversation | null> {
    const result = await client.query<ConversationRow>(
      `
        SELECT *
        FROM debug_conversations
        WHERE owner_type = $1 AND owner_id = $2 AND id = $3
        FOR UPDATE
      `,
      [LOCAL_DEBUG_OWNER.type, LOCAL_DEBUG_OWNER.id, id],
    );

    return result.rows[0] !== undefined ? rowToConversation(result.rows[0]) : null;
  }
}

export class PostgresDebugSummaryProvider implements SummaryProvider {
  public readonly meta = {
    id: "summary.debug-postgres",
    kind: "summary",
    name: "Debug PostgreSQL Summary Provider",
    description: "Stores rolling summaries in debug_conversation_summaries",
    version: "1.0.0",
  } as const;

  private readonly repository: DebugRepository;

  public constructor(repository: DebugRepository) {
    this.repository = repository;
  }

  public async load(input: {
    scope: SummaryScope;
  }): Promise<{ summary?: ConversationSummary | null }> {
    return { summary: await this.repository.loadSummary(input.scope) };
  }

  public async save(input: SummarySaveInput): Promise<SummarySaveResult> {
    return this.repository.saveSummary(input);
  }
}

function normalizeCompanionInput(input: CompanionFormInput): NormalizedCompanionInput {
  const name = input.name.trim();
  const personality = input.personality.trim();

  if (name === "") {
    throw new Error("name is required");
  }
  if (!VALID_GENDERS.includes(input.gender)) {
    throw new Error("gender is invalid");
  }
  if (personality === "") {
    throw new Error("personality is required");
  }

  return {
    name,
    gender: input.gender,
    relationship: input.relationship?.trim() || "AI 伴侣",
    userDisplayName: input.userDisplayName?.trim() || "",
    userAddress: input.userAddress?.trim() || "",
    profile: normalizeCompanionProfile(input.hobbies),
    appearance: normalizeCompanionAppearance(input),
    personality,
    speakingStyle: input.speakingStyle?.trim() || "",
    background: input.background?.trim() || "",
    customInstructions: input.customInstructions?.trim() || "",
  };
}

function rowToCompanion(row: CompanionRow): DebugCompanion {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    relationship: row.relationship ?? "AI 伴侣",
    userDisplayName: row.user_display_name ?? "",
    userAddress: row.user_address ?? "",
    profile: normalizeProfileJson(row.profile),
    appearance: normalizeAppearanceJson(row.appearance),
    personality: row.personality,
    speakingStyle: row.speaking_style ?? "",
    background: row.background ?? "",
    customInstructions: row.custom_instructions ?? "",
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToConversation(row: ConversationRow): DebugConversation {
  return {
    id: row.id,
    companionId: row.companion_id,
    title: row.title,
    lastMessagePreview: row.last_message_preview,
    emotion: normalizeEmotion(row.emotion_json),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToMessage(row: MessageRow): DebugMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    status: row.status,
    errorSummary: row.error_summary,
    model: row.model,
    createdAt: row.created_at.toISOString(),
  };
}

function rowToSummary(row: SummaryRow): ConversationSummary {
  return {
    id: row.conversation_id,
    scope: {
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      companionId: row.companion_id,
      conversationId: row.conversation_id,
    },
    content: row.summary_content,
    messageCount: row.covered_message_count,
    updatedAt: row.updated_at,
    ...(row.metadata !== null ? { metadata: row.metadata } : {}),
  };
}

function normalizeCompanionProfile(hobbies: string[] | undefined): DebugCompanion["profile"] {
  const normalized = hobbies?.map((item) => item.trim()).filter((item) => item.length > 0);

  return normalized !== undefined && normalized.length > 0 ? { hobbies: normalized } : {};
}

function normalizeCompanionAppearance(
  input: Pick<
    CompanionFormInput,
    "heightCm" | "weightKg" | "hair" | "bodyType" | "additionalTraits"
  >,
): DebugCompanion["appearance"] {
  const appearance: DebugCompanion["appearance"] = {};

  if (input.heightCm !== undefined && Number.isFinite(input.heightCm) && input.heightCm > 0) {
    appearance.heightCm = input.heightCm;
  }
  if (input.weightKg !== undefined && Number.isFinite(input.weightKg) && input.weightKg > 0) {
    appearance.weightKg = input.weightKg;
  }
  if (input.hair?.trim()) {
    appearance.hair = input.hair.trim();
  }
  if (input.bodyType?.trim()) {
    appearance.bodyType = input.bodyType.trim();
  }

  const additionalTraits = normalizeAdditionalTraits(input.additionalTraits);
  if (additionalTraits !== undefined) {
    appearance.additionalTraits = additionalTraits;
  }

  return appearance;
}

function normalizeProfileJson(value: unknown): DebugCompanion["profile"] {
  if (!isRecord(value)) {
    return {};
  }

  const hobbies = Array.isArray(value.hobbies)
    ? value.hobbies.filter((item): item is string => typeof item === "string")
    : undefined;

  return normalizeCompanionProfile(hobbies);
}

function normalizeAppearanceJson(value: unknown): DebugCompanion["appearance"] {
  if (!isRecord(value)) {
    return {};
  }

  const input: Pick<
    CompanionFormInput,
    "heightCm" | "weightKg" | "hair" | "bodyType" | "additionalTraits"
  > = {};

  if (typeof value.heightCm === "number") {
    input.heightCm = value.heightCm;
  }
  if (typeof value.weightKg === "number") {
    input.weightKg = value.weightKg;
  }
  if (typeof value.hair === "string") {
    input.hair = value.hair;
  }
  if (typeof value.bodyType === "string") {
    input.bodyType = value.bodyType;
  }
  if (isStringRecord(value.additionalTraits)) {
    input.additionalTraits = value.additionalTraits;
  }

  return normalizeCompanionAppearance(input);
}

function normalizeAdditionalTraits(
  traits: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (traits === undefined) {
    return undefined;
  }

  const normalized: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(traits)) {
    const key = rawKey.trim();
    const value = rawValue.trim();

    if (key !== "" && value !== "") {
      normalized[key] = value;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((item) => typeof item === "string");
}

function rowToRunDetail(row: RunRow): WorkflowRunDetail {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userMessageId: row.user_message_id,
    assistantMessageId: row.assistant_message_id,
    workflowId: row.workflow_id,
    status: row.status,
    model: row.model,
    trace: row.trace_json as WorkflowRunDetail["trace"],
    observerEvents: row.observer_events_json ?? [],
    debugContext: row.debug_context_json as WorkflowRunDetail["debugContext"],
    memorySnapshot: row.memory_snapshot_json,
    emotionSnapshot: row.emotion_snapshot_json,
    toolSnapshot: row.tool_snapshot_json,
    errorSummary: row.error_summary,
    createdAt: row.created_at.toISOString(),
  };
}

function rowToRunListItem(row: RunRow): WorkflowRunListItem {
  return {
    id: row.id,
    userMessageId: row.user_message_id,
    assistantMessageId: row.assistant_message_id,
    status: row.status,
    workflowId: row.workflow_id,
    model: row.model,
    errorSummary: row.error_summary,
    createdAt: row.created_at.toISOString(),
  };
}

function requireRow<T>(row: T | undefined, message = "database write returned no row"): T {
  if (row === undefined) {
    throw new Error(message);
  }

  return row;
}

function normalizeEmotion(raw: unknown): EmotionState | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const emotion = raw as Partial<EmotionState>;
  const allowed = ["neutral", "happy", "sad", "angry", "anxious", "affectionate"];

  if (!allowed.includes(emotion.current as string)) {
    return null;
  }
  if (typeof emotion.intensity !== "number" || !Number.isFinite(emotion.intensity)) {
    return null;
  }

  return {
    current: emotion.current as EmotionState["current"],
    intensity: Math.min(1, Math.max(0, emotion.intensity)),
    ...(emotion.updatedAt !== undefined ? { updatedAt: new Date(emotion.updatedAt) } : {}),
  };
}

function deriveRunStatus(
  output: ChatWorkflowOutput,
): Exclude<WorkflowRunStatus, "running" | "failed"> {
  const trace = output.metadata?.trace;

  return trace?.status === "degraded" ? "degraded" : "success";
}

function previewText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

function titleFromMessage(text: string): string {
  const title = previewText(text).slice(0, 32);

  return title !== "" ? title : "新对话";
}

function pickMemorySnapshot(output: ChatWorkflowOutput): unknown {
  return {
    recalled: output.memories ?? [],
    extracted: output.metadata?.extractedMemories ?? [],
    saved: output.metadata?.savedMemories ?? [],
    skipped: output.metadata?.skippedMemories ?? [],
    embeddingVectorLength: output.metadata?.debugContext?.embeddingVectorLength,
  };
}

function pickEmotionSnapshot(output: ChatWorkflowOutput): unknown {
  return {
    emotion: output.emotion ?? null,
    previous: output.metadata?.debugContext?.previousEmotion,
    detected: output.metadata?.debugContext?.detectedEmotion,
    next: output.metadata?.debugContext?.nextEmotion,
  };
}

function pickToolSnapshot(output: ChatWorkflowOutput): unknown {
  return {
    results: output.toolResults ?? [],
    definitions: output.metadata?.debugContext?.toolDefinitions ?? [],
    calls: output.metadata?.debugContext?.toolCalls ?? [],
    dropped: output.metadata?.debugContext?.droppedToolCalls ?? [],
    followUpGenerated: output.metadata?.toolFollowUpGenerated === true,
  };
}

function findErrorTrace(events: SerializedCoreEvent[]): unknown {
  const event = [...events].reverse().find((item) => item.type === "workflow:error");

  if (typeof event?.payload === "object" && event.payload !== null) {
    return (event.payload as { trace?: unknown }).trace ?? null;
  }

  return null;
}

function findErrorWorkflowId(events: SerializedCoreEvent[]): string | null {
  const trace = findErrorTrace(events);

  if (typeof trace === "object" && trace !== null) {
    const workflowId = (trace as { workflowId?: unknown }).workflowId;

    return typeof workflowId === "string" ? workflowId : null;
  }

  return null;
}

function toJsonParam(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

export function validateCompanionPayload(raw: unknown): CompanionFormInput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("request body must be an object");
  }

  const body = raw as Record<string, unknown>;

  const input: CompanionFormInput = {
    name: typeof body.name === "string" ? body.name : "",
    gender: VALID_GENDERS.includes(body.gender as CompanionGender)
      ? (body.gender as CompanionGender)
      : "unknown",
    personality: typeof body.personality === "string" ? body.personality : "",
  };

  if (typeof body.relationship === "string") {
    input.relationship = body.relationship;
  }
  if (typeof body.userDisplayName === "string") {
    input.userDisplayName = body.userDisplayName;
  }
  if (typeof body.userAddress === "string") {
    input.userAddress = body.userAddress;
  }
  if (Array.isArray(body.hobbies)) {
    input.hobbies = body.hobbies.filter((item): item is string => typeof item === "string");
  }
  if (typeof body.heightCm === "number") {
    input.heightCm = body.heightCm;
  }
  if (typeof body.weightKg === "number") {
    input.weightKg = body.weightKg;
  }
  if (typeof body.hair === "string") {
    input.hair = body.hair;
  }
  if (typeof body.bodyType === "string") {
    input.bodyType = body.bodyType;
  }
  if (isStringRecord(body.additionalTraits)) {
    input.additionalTraits = body.additionalTraits;
  }
  if (typeof body.speakingStyle === "string") {
    input.speakingStyle = body.speakingStyle;
  }
  if (typeof body.background === "string") {
    input.background = body.background;
  }
  if (typeof body.customInstructions === "string") {
    input.customInstructions = body.customInstructions;
  }

  return normalizeCompanionInput(input);
}

export function validateMemoryType(value: unknown): (typeof VALID_MEMORY_TYPES)[number] {
  return VALID_MEMORY_TYPES.includes(value as (typeof VALID_MEMORY_TYPES)[number])
    ? (value as (typeof VALID_MEMORY_TYPES)[number])
    : "note";
}
