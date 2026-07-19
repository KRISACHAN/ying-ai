import { Pool } from "pg";
import {
  DefaultStoryTransitionValidator,
  DefaultStoryWorkflow,
  FakeStoryPlanner,
  FakeStoryRenderer,
  InMemoryStoryProvider,
  KeywordLoreProvider,
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
