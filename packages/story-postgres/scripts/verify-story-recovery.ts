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
} from "@ying-ai/story-core";
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
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://localhost:5432/ying_companion_dev";
  const prefix = `story-recovery-${Date.now()}`;
  const pool = new Pool({ connectionString });
  try {
    await runStoryPostgresMigrations(pool);
    await cleanup(pool, prefix);
    const sessionProvider = new PostgresStorySessionProvider({
      client: pool,
      storyProvider: new InMemoryStoryProvider([fogHarborMystery]),
      idFactory: sequenceIds(`${prefix}-session`),
    });
    const stateProvider = new PostgresStoryStateProvider(pool);
    const session = await sessionProvider.createSession({ storyId: fogHarborMystery.id });
    const firstWorkflow = createWorkflow(pool, sessionProvider, stateProvider, [
      planWith([{ type: "add_clue", clueId: "menu-mark" }]),
      planWith([{ type: "set_attr", key: "clueHeat", value: 1 }]),
      planWith([{ type: "add_event", eventId: "route-opened" }], ["hidden-route"]),
      planWith([{ type: "set_attr", key: "clueHeat", value: 2 }]),
      planWith([]),
    ]);
    for (let index = 1; index <= 5; index += 1) {
      await firstWorkflow.execute({
        sessionId: session.id,
        clientTurnId: `first-${index}`,
        userInput: `第 ${index} 回合`,
      });
    }
    await pool.end();

    const restartedPool = new Pool({ connectionString });
    try {
      const restartedSessionProvider = new PostgresStorySessionProvider({
        client: restartedPool,
        storyProvider: new InMemoryStoryProvider([{ ...fogHarborMystery, title: "种子已变更" }]),
      });
      const restartedStateProvider = new PostgresStoryStateProvider(restartedPool);
      const loaded = await restartedSessionProvider.getSession(session.id);
      assert(
        loaded?.definitionSnapshot.title === fogHarborMystery.title,
        "snapshot should recover",
      );
      const secondWorkflow = createWorkflow(
        restartedPool,
        restartedSessionProvider,
        restartedStateProvider,
        [planWith([{ type: "set_attr", key: "clueHeat", value: 3 }]), planWith([])],
      );
      await secondWorkflow.execute({
        sessionId: session.id,
        clientTurnId: "after-restart-1",
        userInput: "重启后继续一",
      });
      await secondWorkflow.execute({
        sessionId: session.id,
        clientTurnId: "after-restart-2",
        userInput: "重启后继续二",
      });
      const beforeRetry = await restartedStateProvider.getState(session.id);
      await secondWorkflow.execute({
        sessionId: session.id,
        clientTurnId: "after-restart-2",
        userInput: "重试旧回合",
      });
      const finalState = await restartedStateProvider.getState(session.id);
      assert(finalState?.revision === 7, "seven committed turns should set revision 7");
      assert(finalState?.revision === beforeRetry?.revision, "idempotent retry should not advance");
      assert(finalState?.clues.includes("menu-mark") === true, "clue should recover");
      assert(finalState?.events.includes("route-opened") === true, "event should recover");
      assert(
        finalState?.revealedLoreIds.includes("hidden-route") === true,
        "revealed lore should recover",
      );
      const messages = await new PostgresStoryMessageProvider(restartedPool).getRecentMessages(
        session.id,
      );
      assert(messages.length >= 14, "messages should recover across restart");
      await cleanup(restartedPool, prefix);
    } finally {
      await restartedPool.end();
    }
    console.log("ok - postgres multi-turn restart recovery");
  } catch (error) {
    try {
      await cleanup(pool, prefix);
    } catch {
      // Best effort cleanup only.
    }
    throw error;
  }
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
    narrativeBeat: { summary: "推进一个恢复验证回合。", tension: "low" },
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

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
