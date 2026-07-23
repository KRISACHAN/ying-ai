import assert from "node:assert/strict";

import {
  fogHarborMystery,
  initializeStoryState,
  InMemoryStoryProvider,
  InMemoryStorySessionProvider,
  InMemoryStoryStateProvider,
  minimalWuxiaContract,
  type CommittedStoryTurn,
  type StoryMessage,
  type StoryNarrativeSummary,
} from "@ying-companion/story-core";

import {
  createPersistedStoryDebugSnapshot,
  createStorySessionListItem,
  registerRuntimeStoryDefinition,
  resolveStoryDebugTurnSource,
  StoryDefinitionConflictError,
} from "../app/lib/story-workbench-data.ts";

const provider = new InMemoryStoryProvider([fogHarborMystery]);
assert.equal(
  await registerRuntimeStoryDefinition(provider, minimalWuxiaContract),
  "registered",
  "validated imported definition should enter the runtime registry",
);
assert.equal(
  await registerRuntimeStoryDefinition(provider, minimalWuxiaContract),
  "unchanged",
  "identical import should be idempotent",
);
const reorderedDefinition = Object.fromEntries(
  Object.entries(minimalWuxiaContract).reverse(),
) as typeof minimalWuxiaContract;
assert.equal(
  await registerRuntimeStoryDefinition(provider, reorderedDefinition),
  "unchanged",
  "equivalent definitions should be idempotent regardless of JSON key order",
);
const importedSession = await new InMemoryStorySessionProvider({
  storyProvider: provider,
  stateProvider: new InMemoryStoryStateProvider(),
  idFactory: () => "imported-session",
}).createSession({ storyId: minimalWuxiaContract.id });
assert.equal(
  importedSession.definitionSnapshot.title,
  minimalWuxiaContract.title,
  "a registered definition should be available for session creation",
);
await assert.rejects(
  () =>
    registerRuntimeStoryDefinition(provider, {
      ...minimalWuxiaContract,
      version: "2.0.0",
    }),
  StoryDefinitionConflictError,
  "conflicting import must not replace the active definition",
);
assert.equal((await provider.listDefinitions()).length, 2);
assert.equal(
  resolveStoryDebugTurnSource({ wireEventCount: 5, idempotentReplay: false }),
  "live",
  "a normal streamed turn should use live debug artifacts",
);
assert.equal(
  resolveStoryDebugTurnSource({ wireEventCount: 5, idempotentReplay: true }),
  "persisted",
  "an idempotent replay should preserve canonical persisted debug artifacts",
);
assert.equal(
  resolveStoryDebugTurnSource({ wireEventCount: 0, idempotentReplay: false }),
  "persisted",
  "a restored session should use persisted debug artifacts",
);

const state = { ...initializeStoryState(fogHarborMystery), revision: 1 };
const messages: StoryMessage[] = [
  {
    id: "message-user",
    sessionId: "session-1",
    turnId: "turn-1",
    role: "user",
    content: "检查酒单",
    sequence: 1,
    createdAt: "2026-07-23T00:00:00.000Z",
  },
  {
    id: "message-assistant",
    sessionId: "session-1",
    turnId: "turn-1",
    role: "assistant",
    content: "酒单边缘有一道记号。",
    sequence: 2,
    createdAt: "2026-07-23T00:00:01.000Z",
  },
];
const turn: CommittedStoryTurn = {
  id: "turn-1",
  sessionId: "session-1",
  turnNumber: 1,
  clientTurnId: "client-turn-1",
  status: "committed",
  userInput: messages[0]!.content,
  assistantText: messages[1]!.content,
  plan: {
    interpretedAction: { raw: messages[0]!.content, summary: "检查酒单", kind: "other" },
    activeCharacterIds: ["evelyn"],
    narrativeBeat: { summary: "发现酒单记号", tension: "low" },
    stateChanges: [{ type: "add_clue", clueId: "menu-mark" }],
    triggeredEventIds: [],
    revealedLoreIds: [],
    responseGuidance: {
      narratorFocus: "酒单",
      emotionalTone: "克制",
      mustInclude: [],
      mustNotReveal: [],
    },
  },
  recalledLore: [],
  previousStateRevision: 0,
  nextStateRevision: 1,
  stateChanged: true,
  createdAt: "2026-07-23T00:00:00.000Z",
  committedAt: "2026-07-23T00:00:02.000Z",
};
const summary: StoryNarrativeSummary = {
  sessionId: "session-1",
  throughTurnNumber: 1,
  text: "侦探检查了酒单。",
  version: 1,
  updatedAt: "2026-07-23T00:00:03.000Z",
};

const debug = createPersistedStoryDebugSnapshot({
  definition: fogHarborMystery,
  state,
  messages,
  turns: [turn],
  summary,
});
assert.equal(debug.source, "persisted");
assert.equal(debug.latestTurn?.clientTurnId, "client-turn-1");
assert.deepEqual(debug.acceptedChanges, turn.plan.stateChanges);
assert.equal(debug.effectiveContext.recentMessages.length, 2);
assert.deepEqual(debug.timeline, [
  {
    type: "story:committed",
    occurredAt: turn.committedAt,
    turnId: turn.id,
    clientTurnId: turn.clientTurnId,
    turnNumber: turn.turnNumber,
    stateRevision: turn.nextStateRevision,
  },
]);

const snapshotDefinition = {
  ...fogHarborMystery,
  title: "旧版雾港",
  scenes: fogHarborMystery.scenes.map((scene) =>
    scene.id === "white-whale-tavern" ? { ...scene, title: "旧版白鲸酒馆" } : scene,
  ),
};
const listItem = createStorySessionListItem({
  id: "session-1",
  storyId: fogHarborMystery.id,
  definitionVersion: "old-version",
  definition: snapshotDefinition,
  stateRevision: 1,
  currentSceneId: "white-whale-tavern",
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:02.000Z",
});
assert.equal(listItem.storyTitle, "旧版雾港");
assert.equal(listItem.currentSceneTitle, "旧版白鲸酒馆");

console.log("verify:story-workbench-data ok");
