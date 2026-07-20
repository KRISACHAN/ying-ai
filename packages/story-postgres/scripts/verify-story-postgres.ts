import { Pool } from "pg";
import {
  DefaultStoryTransitionValidator,
  DefaultStoryWorkflow,
  FakeStoryPlanner,
  FakeStoryRenderer,
  InMemoryStoryProvider,
  KeywordLoreProvider,
  applyStoryStateChanges,
  type StoryStateChange,
  type StoryTurnPlan,
} from "@ying-companion/story-core";
import {
  PostgresStoryMessageProvider,
  PostgresStorySessionProvider,
  PostgresStoryStateProvider,
  PostgresStorySummaryProvider,
  PostgresStoryTurnCommitter,
  PostgresStoryTurnRepository,
  runStoryPostgresMigrations,
} from "../src";
import { fogHarborMystery } from "./fixtures";

declare const process: {
  env: { DATABASE_URL?: string };
  exitCode?: number;
};

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgresql://localhost:5432/ying_companion_dev",
  });
  const prefix = `story-pg-${Date.now()}`;
  try {
    await runStoryPostgresMigrations(pool);
    await cleanup(pool, prefix);
    await testCreateCommitIdempotencyAndSnapshot(pool, prefix);
    await testStateRevisionConflict(pool, prefix);
    await testFailedTurnRetryCommits(pool, prefix);
    await testSummaryVersionConflict(pool, prefix);
    await cleanup(pool, prefix);
  } finally {
    await pool.end();
  }
}

async function testCreateCommitIdempotencyAndSnapshot(pool: Pool, prefix: string): Promise<void> {
  let definition = fogHarborMystery;
  const storyProvider = {
    async getDefinition() {
      return definition;
    },
  };
  const sessionProvider = new PostgresStorySessionProvider({
    client: pool,
    storyProvider: new InMemoryStoryProvider([definition]),
    idFactory: sequenceIds(`${prefix}-session`),
  });
  const stateProvider = new PostgresStoryStateProvider(pool);
  const session = await sessionProvider.createSession({ storyId: definition.id });
  definition = { ...definition, title: "热更新后不应影响旧存档" };
  const loaded = await sessionProvider.getSession(session.id);
  assert(
    loaded?.definitionSnapshot.title === fogHarborMystery.title,
    "definition snapshot must freeze",
  );

  const workflow = createWorkflow(pool, sessionProvider, stateProvider, [
    planWith([{ type: "add_clue", clueId: "menu-mark" }]),
    planWith([], ["hidden-route"]),
  ]);
  const first = await workflow.execute({
    sessionId: session.id,
    clientTurnId: "client-1",
    userInput: "检查酒单",
  });
  assert(first.nextState.revision === 1, "first committed turn should increment revision");
  const retry = await workflow.execute({
    sessionId: session.id,
    clientTurnId: "client-1",
    userInput: "检查酒单",
  });
  assert(retry.turnId === first.turnId, "same clientTurnId should return committed turn");
  assert(
    (await stateProvider.getState(session.id))?.revision === 1,
    "idempotent retry must not advance",
  );

  const second = await workflow.execute({
    sessionId: session.id,
    clientTurnId: "client-2",
    userInput: "询问隐藏路线",
  });
  assert(second.nextState.revealedLoreIds.includes("hidden-route"), "revealed lore should persist");
  const messages = await new PostgresStoryMessageProvider(pool).getRecentMessages(session.id);
  assert(messages.length === 4, "two committed turns should persist four messages");
  console.log("ok - postgres create, commit, idempotency, snapshot");

  void storyProvider;
}

async function testStateRevisionConflict(pool: Pool, prefix: string): Promise<void> {
  const sessionProvider = new PostgresStorySessionProvider({
    client: pool,
    storyProvider: new InMemoryStoryProvider([fogHarborMystery]),
    idFactory: sequenceIds(`${prefix}-conflict-session`),
  });
  const stateProvider = new PostgresStoryStateProvider(pool);
  const session = await sessionProvider.createSession({ storyId: fogHarborMystery.id });
  const state = await stateProvider.getState(session.id);
  assert(state !== null, "state should exist");
  const nextState = applyStoryStateChanges({
    definition: fogHarborMystery,
    currentState: state,
    changes: [{ type: "add_clue", clueId: "menu-mark" }],
  });
  await assertRejects(
    () =>
      stateProvider.saveState(session.id, { ...nextState, revision: 1 }, { expectedRevision: 99 }),
    "revision conflict",
  );
  assert(
    (await stateProvider.getState(session.id))?.revision === 0,
    "stale saveState must not advance revision",
  );
  console.log("ok - postgres state save revision conflict");
}

async function testFailedTurnRetryCommits(pool: Pool, prefix: string): Promise<void> {
  const sessionProvider = new PostgresStorySessionProvider({
    client: pool,
    storyProvider: new InMemoryStoryProvider([fogHarborMystery]),
    idFactory: sequenceIds(`${prefix}-failed-retry-session`),
  });
  const stateProvider = new PostgresStoryStateProvider(pool);
  const session = await sessionProvider.createSession({ storyId: fogHarborMystery.id });
  const state = await stateProvider.getState(session.id);
  assert(state !== null, "state should exist");
  const failedTurnId = `${prefix}-failed-turn`;
  const now = new Date();
  await pool.query(
    `INSERT INTO story_turns
      (id, session_id, turn_number, client_turn_id, status, user_text, previous_state_revision,
       state_changed, error_json, created_at)
     VALUES ($1, $2, 1, 'retry-after-failed', 'failed', '失败输入', 0, false, $3, $4)`,
    [failedTurnId, session.id, JSON.stringify({ code: "TEST", message: "failed once" }), now],
  );
  const nextState = applyStoryStateChanges({
    definition: fogHarborMystery,
    currentState: state,
    changes: [{ type: "add_clue", clueId: "menu-mark" }],
  });
  const committed = await new PostgresStoryTurnCommitter({
    client: pool,
    idFactory: sequenceIds(`${prefix}-failed-retry-id`),
  }).commitSuccessfulTurn({
    sessionId: session.id,
    clientTurnId: "retry-after-failed",
    expectedStateRevision: 0,
    previousState: state,
    nextState,
    userInput: "重试输入",
    assistantText: "重试成功",
    plan: planWith([{ type: "add_clue", clueId: "menu-mark" }]),
    recalledLore: [],
    stateChanged: true,
  });
  assert(committed.id === failedTurnId, "failed retry should reuse existing turn id");
  assert(committed.status === "committed", "failed retry should commit");
  assert(
    (await stateProvider.getState(session.id))?.revision === 1,
    "failed retry commit should advance revision once",
  );
  const messages = await new PostgresStoryMessageProvider(pool).getRecentMessages(session.id);
  assert(messages.length === 2, "failed retry commit should persist user and assistant messages");
  console.log("ok - postgres failed turn retry commits");
}

async function testSummaryVersionConflict(pool: Pool, prefix: string): Promise<void> {
  const provider = new PostgresStorySummaryProvider(pool);
  const sessionProvider = new PostgresStorySessionProvider({
    client: pool,
    storyProvider: new InMemoryStoryProvider([fogHarborMystery]),
    idFactory: sequenceIds(`${prefix}-summary-session`),
  });
  const session = await sessionProvider.createSession({ storyId: fogHarborMystery.id });
  const state = await new PostgresStoryStateProvider(pool).getState(session.id);
  assert(state !== null, "state should exist");
  const committedTurn = {
    id: `${prefix}-summary-turn`,
    sessionId: session.id,
    turnNumber: 1,
    clientTurnId: "summary-client",
    status: "committed" as const,
    userInput: "summary user",
    assistantText: "summary assistant",
    plan: planWith([]),
    recalledLore: [],
    previousStateRevision: 0,
    nextStateRevision: 1,
    stateChanged: false,
    createdAt: new Date().toISOString(),
    committedAt: new Date().toISOString(),
  };
  const summary = await provider.updateSummary({
    previousSummary: null,
    newlyCommittedTurns: [committedTurn],
    recentMessages: [],
    currentState: state,
    definition: fogHarborMystery,
  });
  await provider.updateSummary({
    previousSummary: summary,
    newlyCommittedTurns: [committedTurn],
    recentMessages: [],
    currentState: state,
    definition: fogHarborMystery,
  });
  await assertRejects(
    () =>
      provider.updateSummary({
        previousSummary: summary,
        newlyCommittedTurns: [committedTurn],
        recentMessages: [],
        currentState: state,
        definition: fogHarborMystery,
      }),
    "version conflict",
  );
  console.log("ok - postgres summary version conflict");
}

function createWorkflow(
  pool: Pool,
  sessionProvider: PostgresStorySessionProvider,
  stateProvider: PostgresStoryStateProvider,
  plans: StoryTurnPlan[],
): DefaultStoryWorkflow {
  return new DefaultStoryWorkflow({
    sessionProvider,
    stateProvider,
    loreProvider: new KeywordLoreProvider(),
    planner: new FakeStoryPlanner({ plans }),
    validator: new DefaultStoryTransitionValidator(),
    renderer: new FakeStoryRenderer({ text: "雾港继续沉默。" }),
    turnRepository: new PostgresStoryTurnRepository(pool),
    messageProvider: new PostgresStoryMessageProvider(pool),
    committer: new PostgresStoryTurnCommitter({ client: pool }),
    summaryProvider: new PostgresStorySummaryProvider(pool),
    runIdFactory: sequenceIds("run"),
  });
}

function planWith(changes: StoryStateChange[], revealedLoreIds: string[] = []): StoryTurnPlan {
  return {
    interpretedAction: { raw: "action", summary: "action", kind: "other" },
    activeCharacterIds: ["evelyn"],
    narrativeBeat: { summary: "推进一个持久化回合。", tension: "low" },
    stateChanges: changes,
    triggeredEventIds: [],
    revealedLoreIds,
    responseGuidance: {
      narratorFocus: "保持当前场景",
      emotionalTone: "克制",
      mustInclude: [],
      mustNotReveal: [],
    },
  };
}

function sequenceIds(prefix: string): () => string {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

async function cleanup(pool: Pool, prefix: string): Promise<void> {
  await pool.query(`DELETE FROM story_sessions WHERE id LIKE $1`, [`${prefix}%`]);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertRejects(fn: () => Promise<unknown>, expectedMessage: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes(expectedMessage),
      `expected rejection including ${expectedMessage}`,
    );
    return;
  }
  throw new Error(`expected rejection including ${expectedMessage}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
