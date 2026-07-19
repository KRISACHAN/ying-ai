import type { SafetyCheckResult, SafetyProvider, CoreProviderMeta } from "@ying-companion/ai-core";
import type { StoryDefinition } from "../src/abstractions/story-definition";
import type { StoryState } from "../src/abstractions/story-state";
import type { StoryStateChange } from "../src/abstractions/story-state-change";
import type { StoryTurnPlan } from "../src/abstractions/story-planner";
import { DefaultStoryWorkflow } from "../src/workflow/default-story-workflow";
import { FakeStoryPlanner } from "../src/planner/fake-story-planner";
import { FakeStoryRenderer } from "../src/renderer/fake-story-renderer";
import { DefaultStoryTransitionValidator } from "../src/state/default-story-transition-validator";
import { InMemoryStoryProvider } from "../src/providers/in-memory-story-provider";
import { InMemoryStorySessionProvider } from "../src/providers/in-memory-story-session-provider";
import { InMemoryStoryStateProvider } from "../src/providers/in-memory-story-state-provider";
import { InMemoryStoryTurnStore } from "../src/providers/in-memory-story-turn-store";
import { InMemoryStoryTurnCommitter } from "../src/providers/in-memory-story-turn-committer";
import { InMemoryStoryTurnRepository } from "../src/providers/in-memory-story-turn-repository";
import { InMemoryStoryMessageProvider } from "../src/providers/in-memory-story-message-provider";
import { KeywordLoreProvider } from "../src/providers/keyword-lore-provider";
import { FakeStorySummaryProvider } from "../src/summary/fake-story-summary-provider";
import { fogHarborMystery } from "./fixtures/fog-harbor-mystery";

declare const process: { exitCode?: number };

async function main(): Promise<void> {
  const tests: Array<[string, () => Promise<void>]> = [
    ["event order and text delta are stable", testEventOrderAndDelta],
    ["successful no-change turn still increments revision", testNoChangeRevision],
    ["same clientTurnId is idempotent", testClientTurnIdIdempotency],
    ["validator failure does not commit or render", testValidatorFailure],
    ["renderer failure does not advance revision", testRendererFailure],
    ["output safety failure does not advance revision", testOutputSafetyFailure],
    ["summary failure does not roll back committed turn", testSummaryFailure],
    ["recent messages only include committed turns", testRecentMessages],
    ["secret lore stays out of renderer until revealed", testSecretLoreVisibility],
    ["reveal condition persists revealedLoreIds", testRevealConditionPersistence],
    ["session state isolation is preserved", testSessionIsolation],
  ];

  for (const [name, test] of tests) {
    await test();
    console.log(`ok - ${name}`);
  }
}

async function testEventOrderAndDelta(): Promise<void> {
  const runtime = await createRuntime({
    renderer: new StreamingRenderer(["雾", "港"]),
    planner: new FakeStoryPlanner({
      plans: [planWith([{ type: "add_clue", clueId: "menu-mark" }])],
    }),
  });
  const events = [];
  for await (const event of runtime.workflow.stream({
    sessionId: runtime.sessionId,
    clientTurnId: "stream-1",
    userInput: "检查酒单",
  })) {
    events.push(event);
  }
  const types = events.map((event) => event.type);
  assert(types.includes("story:context-ready"), "context-ready event should be emitted");
  assert(types.includes("story:committed"), "committed event should be emitted");
  assert(
    events
      .filter((event) => event.type === "story:text-delta")
      .map((event) => event.delta)
      .join("") === "雾港",
    "text deltas should compose assistantText",
  );
  assertStrictlyIncreasing(events.map((event) => event.sequence));
}

async function testNoChangeRevision(): Promise<void> {
  const runtime = await createRuntime({
    planner: new FakeStoryPlanner({ plans: [rejectionPlan()] }),
  });
  const before = await requireState(runtime);
  const result = await runtime.workflow.execute({
    sessionId: runtime.sessionId,
    clientTurnId: "reject-1",
    userInput: "强行穿过上锁密门",
  });
  assert(result.stateChanged === false, "no-change turn should expose stateChanged=false");
  assert(
    result.nextState.revision === before.revision + 1,
    "committed turn must increment revision",
  );
}

async function testClientTurnIdIdempotency(): Promise<void> {
  let planned = 0;
  const runtime = await createRuntime({
    planner: new FakeStoryPlanner({
      handler: () => {
        planned += 1;
        return planWith([{ type: "add_clue", clueId: "menu-mark" }]);
      },
    }),
  });
  const first = await runtime.workflow.execute({
    sessionId: runtime.sessionId,
    clientTurnId: "idem-1",
    userInput: "检查酒单",
  });
  const second = await runtime.workflow.execute({
    sessionId: runtime.sessionId,
    clientTurnId: "idem-1",
    userInput: "检查酒单",
  });
  assert(planned === 1, "idempotent retry must not call planner again");
  assert(second.turnId === first.turnId, "idempotent retry should return committed turn");
  assert(
    (await requireState(runtime)).revision === 1,
    "idempotent retry must not advance revision",
  );
}

async function testValidatorFailure(): Promise<void> {
  let rendered = false;
  const runtime = await createRuntime({
    planner: new FakeStoryPlanner({
      plans: [planWith([{ type: "set_attr", key: "combatPower", value: 10 }])],
    }),
    renderer: new FakeStoryRenderer({
      handler: () => {
        rendered = true;
        return { text: "should not render" };
      },
    }),
  });
  await assertRejects(
    () =>
      runtime.workflow.execute({
        sessionId: runtime.sessionId,
        clientTurnId: "validator-fail",
        userInput: "非法写入",
      }),
    "Story state changes rejected",
  );
  assert(rendered === false, "validator failure must not render");
  assert((await requireState(runtime)).revision === 0, "validator failure must not commit");
}

async function testRendererFailure(): Promise<void> {
  const runtime = await createRuntime({
    planner: new FakeStoryPlanner({
      plans: [planWith([{ type: "add_clue", clueId: "menu-mark" }])],
    }),
    renderer: new FakeStoryRenderer({ shouldThrow: true }),
  });
  await assertRejects(
    () =>
      runtime.workflow.execute({
        sessionId: runtime.sessionId,
        clientTurnId: "renderer-fail",
        userInput: "检查酒单",
      }),
    "Story renderer failed",
  );
  assert((await requireState(runtime)).revision === 0, "renderer failure must not commit");
}

async function testOutputSafetyFailure(): Promise<void> {
  const runtime = await createRuntime({
    planner: new FakeStoryPlanner({
      plans: [planWith([{ type: "add_clue", clueId: "menu-mark" }])],
    }),
    safety: new RejectingOutputSafety(),
  });
  await assertRejects(
    () =>
      runtime.workflow.execute({
        sessionId: runtime.sessionId,
        clientTurnId: "safety-fail",
        userInput: "检查酒单",
      }),
    "Story output rejected",
  );
  assert((await requireState(runtime)).revision === 0, "output safety failure must not commit");
}

async function testSummaryFailure(): Promise<void> {
  const runtime = await createRuntime({
    planner: new FakeStoryPlanner({
      plans: [planWith([{ type: "add_clue", clueId: "menu-mark" }])],
    }),
    summaryProvider: new FakeStorySummaryProvider({ failUpdates: true }),
  });
  const result = await runtime.workflow.execute({
    sessionId: runtime.sessionId,
    clientTurnId: "summary-fail",
    userInput: "检查酒单",
  });
  assert(result.summaryStatus === "failed", "summary failure should be reported");
  assert((await requireState(runtime)).revision === 1, "summary failure must not roll back turn");
}

async function testRecentMessages(): Promise<void> {
  const runtime = await createRuntime({
    planner: new FakeStoryPlanner({ plans: [planWith([]), planWith([])] }),
  });
  await runtime.workflow.execute({
    sessionId: runtime.sessionId,
    clientTurnId: "msg-1",
    userInput: "第一回合",
  });
  await assertRejects(
    () =>
      createRuntime({
        planner: new FakeStoryPlanner({
          plans: [planWith([{ type: "set_attr", key: "bad", value: 1 }])],
        }),
      }).then((failedRuntime) =>
        failedRuntime.workflow.execute({
          sessionId: failedRuntime.sessionId,
          clientTurnId: "msg-failed",
          userInput: "失败回合",
        }),
      ),
    "Story state changes rejected",
  );
  const messages = await runtime.messageProvider.getRecentMessages(runtime.sessionId);
  assert(messages.length === 2, "one committed turn should produce two messages");
  assert(
    messages[0]?.role === "user" && messages[1]?.role === "assistant",
    "messages should be ordered",
  );
}

async function testSecretLoreVisibility(): Promise<void> {
  const runtime = await createRuntime({
    planner: new FakeStoryPlanner({ plans: [planWith([])] }),
    renderer: new FakeStoryRenderer({
      handler: (input) => {
        assert(
          !input.recalledLore.some((entry) => entry.entry.id === "hidden-smuggler-route"),
          "unrevealed secret lore must not reach renderer",
        );
        return { text: "没有泄密" };
      },
    }),
  });
  await runtime.workflow.execute({
    sessionId: runtime.sessionId,
    clientTurnId: "secret-hidden",
    userInput: "询问秘密路线",
  });
}

async function testRevealConditionPersistence(): Promise<void> {
  const definition = clone(fogHarborMystery);
  definition.lore = definition.lore.map((entry) =>
    entry.id === "hidden-smuggler-route"
      ? {
          ...entry,
          revealConditions: [{ type: "has_clue", clueId: "menu-mark" }],
        }
      : entry,
  );
  const runtime = await createRuntime({
    definition,
    planner: new FakeStoryPlanner({
      plans: [planWith([{ type: "add_clue", clueId: "menu-mark" }]), planWith([])],
    }),
  });
  await runtime.workflow.execute({
    sessionId: runtime.sessionId,
    clientTurnId: "reveal-condition-1",
    userInput: "检查酒单",
  });
  await runtime.workflow.execute({
    sessionId: runtime.sessionId,
    clientTurnId: "reveal-condition-2",
    userInput: "询问秘密路线",
  });
  const state = await requireState(runtime);
  assert(
    state.revealedLoreIds.includes("hidden-smuggler-route"),
    "reveal condition should persist revealedLoreIds",
  );
}

async function testSessionIsolation(): Promise<void> {
  const runtime = await createRuntime({
    planner: new FakeStoryPlanner({
      plans: [planWith([{ type: "add_clue", clueId: "menu-mark" }])],
    }),
  });
  const otherSession = await runtime.sessionProvider.createSession({
    storyId: fogHarborMystery.id,
  });
  await runtime.workflow.execute({
    sessionId: runtime.sessionId,
    clientTurnId: "isolation-1",
    userInput: "检查酒单",
  });
  const otherState = await runtime.stateProvider.getState(otherSession.id);
  assert(otherState?.revision === 0, "other session state must remain isolated");
}

async function createRuntime(input: {
  definition?: StoryDefinition;
  planner: FakeStoryPlanner;
  renderer?: FakeStoryRenderer;
  summaryProvider?: FakeStorySummaryProvider;
  safety?: SafetyProvider;
}) {
  const storyProvider = new InMemoryStoryProvider([input.definition ?? fogHarborMystery]);
  const stateProvider = new InMemoryStoryStateProvider();
  const sessionProvider = new InMemoryStorySessionProvider({
    storyProvider,
    stateProvider,
    idFactory: predictableIds(),
  });
  const store = new InMemoryStoryTurnStore();
  const turnRepository = new InMemoryStoryTurnRepository(store);
  const messageProvider = new InMemoryStoryMessageProvider(store);
  const session = await sessionProvider.createSession({
    storyId: (input.definition ?? fogHarborMystery).id,
  });
  const workflow = new DefaultStoryWorkflow({
    sessionProvider,
    stateProvider,
    loreProvider: new KeywordLoreProvider(),
    planner: input.planner,
    validator: new DefaultStoryTransitionValidator(),
    renderer: input.renderer ?? new FakeStoryRenderer({ text: "雾港继续沉默。" }),
    committer: new InMemoryStoryTurnCommitter({
      store,
      stateProvider,
      idFactory: predictableIds(),
    }),
    turnRepository,
    messageProvider,
    summaryProvider: input.summaryProvider ?? new FakeStorySummaryProvider(),
    safety: input.safety,
    runIdFactory: predictableIds(),
  });
  return { workflow, sessionId: session.id, stateProvider, sessionProvider, messageProvider };
}

class StreamingRenderer extends FakeStoryRenderer {
  constructor(private readonly deltas: string[]) {
    super();
  }

  async *stream(): AsyncIterable<string> {
    for (const delta of this.deltas) {
      yield delta;
    }
  }
}

class RejectingOutputSafety implements SafetyProvider {
  readonly meta: CoreProviderMeta = {
    id: "test.safety",
    kind: "safety",
    name: "Test Safety",
    version: "0.0.0",
  };

  async guardInput(): Promise<SafetyCheckResult> {
    return { allowed: true };
  }

  async guardOutput(): Promise<SafetyCheckResult> {
    return { allowed: false, reason: "blocked" };
  }
}

function planWith(changes: StoryStateChange[], revealedLoreIds: string[] = []): StoryTurnPlan {
  return {
    interpretedAction: { raw: "action", summary: "action", kind: "other" },
    activeCharacterIds: ["evelyn"],
    narrativeBeat: { summary: "推进一个受控回合。", tension: "low" },
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

function rejectionPlan(): StoryTurnPlan {
  return {
    ...planWith([]),
    interpretedAction: { raw: "rejected", summary: "rejected", kind: "rejected" },
    rejection: { reason: "locked", inWorldGuidance: "门锁没有松动。" },
  };
}

async function requireState(runtime: {
  stateProvider: InMemoryStoryStateProvider;
  sessionId: string;
}): Promise<StoryState> {
  const state = await runtime.stateProvider.getState(runtime.sessionId);
  if (!state) {
    throw new Error("state missing");
  }
  return state;
}

function predictableIds(): () => string {
  let index = 0;
  return () => `id-${++index}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assert(condition: boolean, message: string): void {
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

function assertStrictlyIncreasing(values: number[]): void {
  for (let index = 1; index < values.length; index += 1) {
    assert(values[index]! > values[index - 1]!, "sequence must be strictly increasing");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
