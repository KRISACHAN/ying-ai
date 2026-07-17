import type { SafetyCheckResult, SafetyProvider } from "@ying-companion/ai-core";
import type { CoreProviderMeta } from "@ying-companion/ai-core";
import type { StoryDefinition } from "../src/abstractions/story-definition";
import type { StoryTurnPlan } from "../src/abstractions/story-planner";
import type { StoryStateChange } from "../src/abstractions/story-state-change";
import { validateStoryDefinition } from "../src/definition/validate-story-definition";
import { FakeStoryPlanner } from "../src/planner/fake-story-planner";
import { FakeStoryRenderer } from "../src/renderer/fake-story-renderer";
import { fogHarborMystery } from "./fixtures/fog-harbor-mystery";
import { minimalWuxiaContract } from "./fixtures/minimal-wuxia-contract";
import { applyStoryStateChanges } from "../src/state/apply-story-state-changes";
import { DefaultStoryTransitionValidator } from "../src/state/default-story-transition-validator";
import { initializeStoryState } from "../src/state/initialize-story-state";
import { DefaultStoryWorkflow } from "../src/workflow/default-story-workflow";
import { InMemoryStoryProvider } from "../src/providers/in-memory-story-provider";
import { InMemoryStorySessionProvider } from "../src/providers/in-memory-story-session-provider";
import { InMemoryStoryStateProvider } from "../src/providers/in-memory-story-state-provider";
import { KeywordLoreProvider } from "../src/providers/keyword-lore-provider";

declare const process: { exitCode?: number };

const validator = new DefaultStoryTransitionValidator();

async function main(): Promise<void> {
  const tests: Array<[string, () => void | Promise<void>]> = [
    ["required default is required", testRequiredDefault],
    ["number default bounds are enforced", testNumberDefaultBounds],
    ["enum default is enforced", testEnumDefault],
    ["string maxLength is required", testStringMaxLengthRequired],
    ["string default maxLength is enforced", testStringDefaultTooLong],
    ["undeclared set_attr is rejected", testUndeclaredAttr],
    ["set_attr type bounds and maxLength are enforced", testSetAttrValidation],
    ["writable=false is enforced", testReadonlyAttr],
    ["scopeRef is required and validated", testScopeRefValidation],
    ["characterIds restrictions are enforced", testCharacterRestriction],
    ["scene item clue event references are validated", testInvalidEntityReferences],
    ["objectiveIds are unsupported", testUnsupportedObjectiveIds],
    ["duplicate item clue event changes are atomic rejects", testDuplicateCatalogAdds],
    ["same batch duplicate writes conflict", testSameBatchConflicts],
    ["relationships require opt-in", testRelationshipDisabled],
    ["invalid change batch does not apply", testAtomicInvalidBatch],
    ["renderer failure does not save", testRendererFailureDoesNotSave],
    ["output safety failure does not save", testOutputSafetyDoesNotSave],
    ["fog harbor and wuxia schemas initialize", testSchemaInitialization],
    ["same runtime supports two schemas", testSameRuntimeSupportsTwoSchemas],
    ["session uses definition snapshot", testSessionSnapshot],
    ["present character must belong to current scene", testPresentSceneMismatch],
    ["dead or unavailable character cannot become present", testSetPresentGuards],
    ["set_scene rejects lingering present characters", testSetSceneLingeringPresentReject],
    ["set_scene with legal present adjustment passes", testSetSceneWithPresentAdjustment],
    [
      "set_scene uses same-batch item and final scene presence",
      testSetSceneWithSameBatchItemAndTargetPresence,
    ],
    ["event ids are one-shot", testEventOneShot],
    ["revealed secret lore enters renderer", testRevealedSecretLoreEntersRenderer],
    ["unknown revealed lore rejects without saving", testUnknownRevealedLoreRejects],
  ];

  for (const [name, test] of tests) {
    await test();
    console.log(`ok - ${name}`);
  }
}

function testRequiredDefault(): void {
  const definition = clone(fogHarborMystery);
  definition.attributes[0] = { ...definition.attributes[0]!, required: true };
  delete definition.attributes[0]!.default;
  assertInvalidDefinition(definition, "definition.attribute.default.required");
}

function testNumberDefaultBounds(): void {
  const definition = clone(fogHarborMystery);
  definition.attributes[0] = { ...definition.attributes[0]!, default: 101 };
  assertInvalidDefinition(definition, "attribute.value.max");
}

function testEnumDefault(): void {
  const definition = clone(minimalWuxiaContract);
  definition.attributes[1] = { ...definition.attributes[1]!, default: "掌门" };
  assertInvalidDefinition(definition, "attribute.value.enum");
}

function testStringMaxLengthRequired(): void {
  const definition = clone(fogHarborMystery);
  definition.attributes[2] = { ...definition.attributes[2]! };
  delete definition.attributes[2]!.maxLength;
  assertInvalidDefinition(definition, "definition.attribute.string.maxLength");
}

function testStringDefaultTooLong(): void {
  const definition = clone(fogHarborMystery);
  definition.attributes[2] = { ...definition.attributes[2]!, default: "x".repeat(41) };
  assertInvalidDefinition(definition, "attribute.value.maxLength");
}

async function testUndeclaredAttr(): Promise<void> {
  const state = initializeStoryState(fogHarborMystery);
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [{ type: "set_attr", key: "combatPower", value: 10 }],
    "change.attribute.undeclared",
  );
}

async function testSetAttrValidation(): Promise<void> {
  const fogState = initializeStoryState(fogHarborMystery);
  await assertInvalidChanges(
    fogHarborMystery,
    fogState,
    [{ type: "set_attr", key: "clueHeat", value: "hot" }],
    "attribute.value.type",
  );
  await assertInvalidChanges(
    fogHarborMystery,
    fogState,
    [{ type: "set_attr", key: "clueHeat", value: 101 }],
    "attribute.value.max",
  );
  const wuxiaState = initializeStoryState(minimalWuxiaContract);
  await assertInvalidChanges(
    minimalWuxiaContract,
    wuxiaState,
    [{ type: "set_attr", key: "sectStanding", value: "掌门" }],
    "attribute.value.enum",
  );
}

async function testReadonlyAttr(): Promise<void> {
  const state = initializeStoryState(fogHarborMystery);
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [{ type: "set_attr", key: "publicTitle", value: "港口侦探" }],
    "change.attribute.readonly",
  );
}

async function testScopeRefValidation(): Promise<void> {
  const state = initializeStoryState(fogHarborMystery);
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [{ type: "set_attr", key: "trust", value: 1 }],
    "change.attribute.scopeRef.missing",
  );
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [{ type: "set_attr", key: "trust", scopeRef: "missing", value: 1 }],
    "change.attribute.scopeRef.invalid",
  );
}

async function testCharacterRestriction(): Promise<void> {
  const state = initializeStoryState(fogHarborMystery);
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [{ type: "set_attr", key: "trust", scopeRef: "leon", value: 1 }],
    "change.attribute.character.restricted",
  );
}

async function testInvalidEntityReferences(): Promise<void> {
  const state = initializeStoryState(fogHarborMystery);
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [{ type: "set_scene", sceneId: "missing" }],
    "change.scene.invalid",
  );
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [{ type: "add_inventory_item", itemId: "missing" }],
    "change.item.invalid",
  );
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [{ type: "add_clue", clueId: "missing" }],
    "change.clue.invalid",
  );
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [{ type: "add_event", eventId: "missing" }],
    "change.event.invalid",
  );
}

function testUnsupportedObjectiveIds(): void {
  const definition = clone(fogHarborMystery) as StoryDefinition & {
    scenes: Array<StoryDefinition["scenes"][number] & { objectiveIds?: string[] }>;
  };
  definition.scenes[0] = { ...definition.scenes[0]!, objectiveIds: ["unsupported"] };
  assertInvalidDefinition(definition, "definition.objectives.unsupported");
}

async function testDuplicateCatalogAdds(): Promise<void> {
  const state = initializeStoryState(fogHarborMystery);
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [
      { type: "add_inventory_item", itemId: "blue-moon-menu" },
      { type: "add_inventory_item", itemId: "blue-moon-menu" },
    ],
    "change.conflict.duplicate",
  );
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [
      { type: "add_clue", clueId: "menu-mark" },
      { type: "add_clue", clueId: "menu-mark" },
    ],
    "change.conflict.duplicate",
  );
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [
      { type: "add_event", eventId: "first-ask-evelyn-about-sister" },
      { type: "add_event", eventId: "first-ask-evelyn-about-sister" },
    ],
    "change.conflict.duplicate",
  );
}

async function testSameBatchConflicts(): Promise<void> {
  const state = initializeStoryState(fogHarborMystery);
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [
      { type: "set_scene", sceneId: "white-whale-tavern" },
      { type: "set_scene", sceneId: "old-harbor" },
    ],
    "change.conflict.set_scene",
  );
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [
      { type: "set_attr", key: "clueHeat", value: 1 },
      { type: "set_attr", key: "clueHeat", value: 2 },
    ],
    "change.conflict.duplicate",
  );
}

async function testRelationshipDisabled(): Promise<void> {
  const state = initializeStoryState(fogHarborMystery);
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [{ type: "set_relationship", characterId: "evelyn", value: 1 }],
    "change.relationship.disabled",
  );
}

async function testAtomicInvalidBatch(): Promise<void> {
  const state = initializeStoryState(fogHarborMystery);
  const result = await validator.validate({
    definition: fogHarborMystery,
    currentState: state,
    changes: [
      { type: "add_inventory_item", itemId: "blue-moon-menu" },
      { type: "set_attr", key: "combatPower", value: 5 },
    ],
  });
  assert(!result.valid, "mixed valid and invalid batch should reject");
  assert(
    !state.inventory.includes("blue-moon-menu"),
    "current state must not be mutated by rejected validation",
  );
}

async function testRendererFailureDoesNotSave(): Promise<void> {
  const runtime = await createRuntime(
    fogHarborMystery,
    new FakeStoryPlanner({ plans: [planWith([{ type: "add_clue", clueId: "menu-mark" }])] }),
    new FakeStoryRenderer({ shouldThrow: true }),
  );
  await assertRejects(
    () => runtime.workflow.execute({ sessionId: runtime.sessionId, userInput: "检查酒单" }),
    "FakeStoryRenderer",
  );
  const state = await runtime.stateProvider.getState(runtime.sessionId);
  assert(
    state !== null && !state.clues.includes("menu-mark"),
    "renderer failure must not save nextState",
  );
}

async function testOutputSafetyDoesNotSave(): Promise<void> {
  const runtime = await createRuntime(
    fogHarborMystery,
    new FakeStoryPlanner({ plans: [planWith([{ type: "add_clue", clueId: "menu-mark" }])] }),
    new FakeStoryRenderer({ text: "unsafe" }),
    new RejectingOutputSafety(),
  );
  await assertRejects(
    () => runtime.workflow.execute({ sessionId: runtime.sessionId, userInput: "检查酒单" }),
    "safety",
  );
  const state = await runtime.stateProvider.getState(runtime.sessionId);
  assert(
    state !== null && !state.clues.includes("menu-mark"),
    "output safety failure must not save nextState",
  );
}

function testSchemaInitialization(): void {
  const fog = initializeStoryState(fogHarborMystery);
  const wuxia = initializeStoryState(minimalWuxiaContract);
  assert(fog.attrs.clueHeat === 0, "fog clueHeat should initialize");
  assert(fog.attrs["character:evelyn:trust"] === 0, "fog evelyn trust should initialize");
  assert(fog.attrs["player:combatPower"] === undefined, "fog must not initialize combatPower");
  assert(wuxia.attrs["player:combatPower"] === 10, "wuxia combatPower should initialize");
  assert(wuxia.attrs.clueHeat === undefined, "wuxia must not initialize clueHeat");
}

async function testSameRuntimeSupportsTwoSchemas(): Promise<void> {
  const storyProvider = new InMemoryStoryProvider([fogHarborMystery, minimalWuxiaContract]);
  const stateProvider = new InMemoryStoryStateProvider();
  const sessionProvider = new InMemoryStorySessionProvider({
    storyProvider,
    stateProvider,
    idFactory: predictableIds(),
  });
  const fogSession = await sessionProvider.createSession({ storyId: fogHarborMystery.id });
  const wuxiaSession = await sessionProvider.createSession({ storyId: minimalWuxiaContract.id });
  const workflow = new DefaultStoryWorkflow({
    sessionProvider,
    stateProvider,
    loreProvider: new KeywordLoreProvider(),
    planner: new FakeStoryPlanner({
      handler: (input) =>
        input.definition.id === fogHarborMystery.id
          ? planWith([{ type: "set_attr", key: "clueHeat", value: 1 }])
          : planWith([{ type: "set_attr", key: "combatPower", value: 11 }]),
    }),
    validator,
    renderer: new FakeStoryRenderer(),
  });
  await workflow.execute({ sessionId: fogSession.id, userInput: "继续调查" });
  await workflow.execute({ sessionId: wuxiaSession.id, userInput: "提剑" });
  const fog = await stateProvider.getState(fogSession.id);
  const wuxia = await stateProvider.getState(wuxiaSession.id);
  assert(fog?.attrs.clueHeat === 1, "fog runtime should update clueHeat");
  assert(wuxia?.attrs["player:combatPower"] === 11, "wuxia runtime should update combatPower");
}

async function testSessionSnapshot(): Promise<void> {
  let currentDefinition = clone(fogHarborMystery);
  const storyProvider = {
    async getDefinition(): Promise<StoryDefinition> {
      return clone(currentDefinition);
    },
  };
  const stateProvider = new InMemoryStoryStateProvider();
  const sessionProvider = new InMemoryStorySessionProvider({
    storyProvider,
    stateProvider,
    idFactory: predictableIds(),
  });
  const session = await sessionProvider.createSession({ storyId: fogHarborMystery.id });
  currentDefinition = { ...currentDefinition, title: "被热更新的标题" };
  const loaded = await sessionProvider.getSession(session.id);
  assert(
    loaded?.definitionSnapshot.title === fogHarborMystery.title,
    "session must keep definition snapshot",
  );
}

async function testPresentSceneMismatch(): Promise<void> {
  const state = initializeStoryState(fogHarborMystery);
  const inconsistent = {
    ...state,
    currentSceneId: "old-harbor",
    inventory: ["old-harbor-pass"],
  };
  await assertInvalidChanges(fogHarborMystery, inconsistent, [], "state.character.scene_mismatch");
}

async function testSetPresentGuards(): Promise<void> {
  const state = initializeStoryState(fogHarborMystery);
  const deadLeon = applyStoryStateChanges({
    definition: fogHarborMystery,
    currentState: state,
    changes: [{ type: "set_character_alive", characterId: "leon", alive: false }],
  });
  await assertInvalidChanges(
    fogHarborMystery,
    deadLeon,
    [{ type: "set_character_present", characterId: "leon", present: true }],
    "change.character.dead_present",
  );
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [{ type: "set_character_present", characterId: "samuel", present: true }],
    "change.character.unavailable",
  );
}

async function testSetSceneLingeringPresentReject(): Promise<void> {
  const state = applyStoryStateChanges({
    definition: fogHarborMystery,
    currentState: initializeStoryState(fogHarborMystery),
    changes: [{ type: "add_inventory_item", itemId: "old-harbor-pass" }],
  });
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [{ type: "set_scene", sceneId: "old-harbor" }],
    "state.character.scene_mismatch",
  );
}

async function testSetSceneWithPresentAdjustment(): Promise<void> {
  const state = applyStoryStateChanges({
    definition: fogHarborMystery,
    currentState: initializeStoryState(fogHarborMystery),
    changes: [{ type: "add_inventory_item", itemId: "old-harbor-pass" }],
  });
  const result = await validator.validate({
    definition: fogHarborMystery,
    currentState: state,
    changes: [
      { type: "set_scene", sceneId: "old-harbor" },
      { type: "set_character_present", characterId: "evelyn", present: false },
      { type: "set_character_present", characterId: "leon", present: true },
    ],
  });
  assert(result.valid, "scene transition with legal present adjustment should pass");
}

async function testSetSceneWithSameBatchItemAndTargetPresence(): Promise<void> {
  const result = await validator.validate({
    definition: fogHarborMystery,
    currentState: initializeStoryState(fogHarborMystery),
    changes: [
      { type: "add_inventory_item", itemId: "old-harbor-pass" },
      { type: "set_scene", sceneId: "old-harbor" },
      { type: "set_character_present", characterId: "evelyn", present: false },
      { type: "set_character_present", characterId: "samuel", present: true },
    ],
  });
  assert(result.valid, "same-batch item pickup, scene transition, and target presence should pass");
}

async function testEventOneShot(): Promise<void> {
  const state = applyStoryStateChanges({
    definition: fogHarborMystery,
    currentState: initializeStoryState(fogHarborMystery),
    changes: [{ type: "add_event", eventId: "first-ask-evelyn-about-sister" }],
  });
  await assertInvalidChanges(
    fogHarborMystery,
    state,
    [{ type: "add_event", eventId: "first-ask-evelyn-about-sister" }],
    "change.event.duplicate",
  );
}

async function testRevealedSecretLoreEntersRenderer(): Promise<void> {
  const runtime = await createRuntime(
    fogHarborMystery,
    new FakeStoryPlanner({ plans: [planWith([], ["hidden-smuggler-route"])] }),
    new FakeStoryRenderer({
      handler: (input) => {
        assert(
          input.recalledLore.some((entry) => entry.id === "hidden-smuggler-route"),
          "revealed secret lore should enter renderer context",
        );
        return { text: "秘密路线被揭示" };
      },
    }),
  );
  const result = await runtime.workflow.execute({
    sessionId: runtime.sessionId,
    userInput: "逼问旧港口路线",
  });
  assert(
    result.recalledLoreIds.includes("hidden-smuggler-route"),
    "workflow result should include revealed lore id",
  );
}

async function testUnknownRevealedLoreRejects(): Promise<void> {
  const runtime = await createRuntime(
    fogHarborMystery,
    new FakeStoryPlanner({
      plans: [planWith([{ type: "add_clue", clueId: "menu-mark" }], ["missing-lore"])],
    }),
    new FakeStoryRenderer({ text: "should not render" }),
  );
  await assertRejects(
    () => runtime.workflow.execute({ sessionId: runtime.sessionId, userInput: "揭示不存在的秘密" }),
    "unknown lore",
  );
  const state = await runtime.stateProvider.getState(runtime.sessionId);
  assert(
    state !== null && !state.clues.includes("menu-mark"),
    "unknown lore failure must not save",
  );
}

async function createRuntime(
  definition: StoryDefinition,
  planner: FakeStoryPlanner,
  renderer: FakeStoryRenderer,
  safety?: SafetyProvider,
) {
  const storyProvider = new InMemoryStoryProvider([definition]);
  const stateProvider = new InMemoryStoryStateProvider();
  const sessionProvider = new InMemoryStorySessionProvider({
    storyProvider,
    stateProvider,
    idFactory: predictableIds(),
  });
  const session = await sessionProvider.createSession({ storyId: definition.id });
  const options = {
    sessionProvider,
    stateProvider,
    loreProvider: new KeywordLoreProvider(),
    planner,
    validator,
    renderer,
  };
  const workflow = new DefaultStoryWorkflow(safety ? { ...options, safety } : options);
  return { workflow, stateProvider, sessionId: session.id };
}

function planWith(stateChanges: StoryStateChange[], revealedLoreIds: string[] = []): StoryTurnPlan {
  return {
    interpretedAction: {
      raw: "action",
      summary: "action",
      kind: "other",
    },
    activeCharacterIds: [],
    narrativeBeat: {
      summary: "state changes are planned",
      tension: "low",
    },
    stateChanges,
    triggeredEventIds: [],
    revealedLoreIds,
    responseGuidance: {
      narratorFocus: "validated state",
      emotionalTone: "neutral",
      mustInclude: [],
      mustNotReveal: [],
    },
  };
}

async function assertInvalidChanges(
  definition: StoryDefinition,
  currentState: ReturnType<typeof initializeStoryState>,
  changes: Parameters<typeof validator.validate>[0]["changes"],
  code: string,
): Promise<void> {
  const result = await validator.validate({ definition, currentState, changes });
  assert(!result.valid, `expected invalid changes with ${code}`);
  assert(
    result.errors.some((error) => error.code === code),
    `expected error ${code}, got ${JSON.stringify(result.errors)}`,
  );
}

function assertInvalidDefinition(definition: StoryDefinition, code: string): void {
  const result = validateStoryDefinition(definition);
  assert(!result.valid, `expected invalid definition with ${code}`);
  assert(
    result.errors.some((error) => error.code === code),
    `expected error ${code}, got ${JSON.stringify(result.errors)}`,
  );
}

async function assertRejects(fn: () => Promise<unknown>, includes: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes(includes),
      `expected rejection including ${includes}`,
    );
    return;
  }
  throw new Error(`Expected promise to reject with ${includes}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function predictableIds(): () => string {
  let index = 0;
  return () => {
    index += 1;
    return `test-session-${index}`;
  };
}

class RejectingOutputSafety implements SafetyProvider {
  readonly meta: CoreProviderMeta = {
    id: "test.rejecting-output-safety",
    kind: "safety",
    name: "Rejecting Output Safety",
    version: "0.0.0",
  };

  async guardInput(): Promise<SafetyCheckResult> {
    return { allowed: true };
  }

  async guardOutput(): Promise<SafetyCheckResult> {
    return { allowed: false, reason: "blocked by test safety" };
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
