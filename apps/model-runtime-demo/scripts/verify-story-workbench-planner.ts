import assert from "node:assert/strict";

import type {
  ChatModel,
  GenerateInput,
  GenerateOutput,
  GenerateStreamChunk,
} from "@ying-ai/ai-core";
import {
  DefaultStoryTransitionValidator,
  fogHarborMystery,
  initializeStoryState,
  ModelStoryPlanner,
  ModelStoryRenderer,
  type StoryMessage,
  type StoryNarrativeSummary,
  type StoryTurnPlan,
} from "@ying-ai/story-core";

const sessionId = "model-story-contract-session";
const userInput = "伊芙琳冷冷地看了一眼，就开始自顾自地调酒。";
const state = initializeStoryState(fogHarborMystery);
const summary: StoryNarrativeSummary = {
  sessionId,
  throughTurnNumber: 2,
  text: "侦探刚进入白鲸酒馆，还没有向伊芙琳提问。",
  version: 1,
  updatedAt: new Date().toISOString(),
};
const recentMessages: StoryMessage[] = [
  {
    id: "message-1",
    sessionId,
    turnId: "turn-1",
    role: "user",
    content: "我把潮湿的信放在柜台上。",
    sequence: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: "message-2",
    sessionId,
    turnId: "turn-1",
    role: "assistant",
    content: "伊芙琳没有碰那封信，只把杯沿擦得更慢。",
    sequence: 2,
    createdAt: new Date().toISOString(),
  },
];
const plan: StoryTurnPlan = {
  interpretedAction: {
    raw: "模型返回的错误 raw",
    summary: "伊芙琳以冷淡和调酒回应来客。",
    kind: "other",
  },
  activeCharacterIds: ["evelyn", "player", "evelyn"],
  narrativeBeat: {
    summary: "酒馆内的试探继续，但没有新线索被确认。",
    tension: "low",
  },
  stateChanges: [],
  triggeredEventIds: [],
  revealedLoreIds: [],
  responseGuidance: {
    narratorFocus: "伊芙琳的动作和双方之间的沉默",
    emotionalTone: "克制、试探",
    mustInclude: ["调酒动作"],
    mustNotReveal: ["伊芙琳见过姐姐"],
  },
};

class ContractModel implements ChatModel {
  readonly meta = {
    id: "model.story-contract",
    kind: "model" as const,
    name: "Story contract model",
  };
  readonly primaryProfile = {
    provider: "fake-contract",
    model: "fake-story-model",
    capabilities: { streaming: true, toolCalling: false, usage: false },
  };
  readonly generateInputs: GenerateInput[] = [];
  readonly streamInputs: GenerateInput[] = [];

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    this.generateInputs.push(input);
    return input.structuredOutput
      ? { text: "", model: this.primaryProfile.model, raw: null, structuredOutput: plan }
      : { text: "伊芙琳把量酒器扣在杯口。", model: this.primaryProfile.model, raw: null };
  }

  async *stream(input: GenerateInput): AsyncIterable<GenerateStreamChunk> {
    this.streamInputs.push(input);
    yield { text: "伊芙琳把量酒器", model: this.primaryProfile.model, raw: null };
    yield { text: "扣在杯口，冰块轻响。", model: this.primaryProfile.model, raw: null };
  }
}

const model = new ContractModel();
const planner = new ModelStoryPlanner(model);
const planned = await planner.plan({
  sessionId,
  userInput,
  definition: fogHarborMystery,
  state,
  recalledLore: [],
  summary,
  recentMessages,
});

assert.equal(planned.interpretedAction.raw, userInput, "planner must preserve the actual input");
assert.deepEqual(planned.stateChanges, [], "neutral narration must not fabricate state changes");
assert.deepEqual(
  planned.activeCharacterIds,
  ["evelyn"],
  "planner must remove unknown, duplicate, or unavailable active characters",
);

const validator = new DefaultStoryTransitionValidator();
const validation = await validator.validate({
  definition: fogHarborMystery,
  currentState: state,
  changes: planned.stateChanges,
});
assert.equal(validation.valid, true);

const plannerPayload = readUserPayload(model.generateInputs[0]);
assert.equal(plannerPayload.userInput, userInput);
assert.equal(plannerPayload.narrativeSummary, summary.text);
assert.deepEqual(plannerPayload.recentMessages, [
  { role: "user", content: recentMessages[0]?.content },
  { role: "assistant", content: recentMessages[1]?.content },
]);
const plannerStory = plannerPayload.story as Record<string, unknown>;
assert.equal("lore" in plannerStory, false, "unrecalled lore must not enter planner story context");
const plannerCharacters = plannerStory.characters as Array<Record<string, unknown>>;
assert.equal(
  plannerCharacters.some((character) => "privateBackground" in character || "secrets" in character),
  false,
  "private character fields must not enter planner story context",
);
assert.equal(
  JSON.stringify(plannerStory).includes("旧港口三号码头后有一条绕过巡逻的窄路"),
  false,
  "unrecalled secret content must not be serialized through the definition",
);

const hiddenLore = fogHarborMystery.lore.find((entry) => entry.id === "hidden-smuggler-route");
assert.ok(hiddenLore, "fog harbor seed must include hidden lore");
await planner.plan({
  sessionId,
  userInput,
  definition: fogHarborMystery,
  state,
  recalledLore: [
    {
      entry: hiddenLore,
      visibility: "planner_only",
      activationReason: ["always"],
      priority: hiddenLore.priority ?? 0,
      estimatedTokens: 20,
    },
  ],
  summary,
  recentMessages,
});
const recalledPlannerPayload = readUserPayload(model.generateInputs[1]);
assert.equal(
  JSON.stringify(recalledPlannerPayload.recalledLore).includes(hiddenLore.content),
  true,
  "planner_only lore must still enter the planner through recalledLore",
);

const renderer = new ModelStoryRenderer(model);
let rendered = "";
for await (const delta of renderer.stream({
  sessionId,
  userInput,
  definition: fogHarborMystery,
  currentState: state,
  nextState: state,
  plan: planned,
  recalledLore: [],
  summary,
  recentMessages,
})) {
  rendered += delta;
}

assert.equal(rendered, "伊芙琳把量酒器扣在杯口，冰块轻响。");
assert.equal(model.streamInputs.length, 1, "renderer must use the model streaming boundary");
const rendererPayload = readUserPayload(model.streamInputs[0]);
assert.equal(rendererPayload.userInput, userInput);
assert.equal(rendererPayload.narrativeSummary, summary.text);
assert.deepEqual(rendererPayload.validatedPlan, planned);

console.log("verify:story-workbench-planner ok");

function readUserPayload(input: GenerateInput | undefined): Record<string, unknown> {
  assert.ok(input, "model call must exist");
  const content = input.messages.find((message) => message.role === "user")?.content;
  assert.ok(content, "model call must include a user payload");
  return JSON.parse(content) as Record<string, unknown>;
}
