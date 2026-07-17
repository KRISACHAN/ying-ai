import type { SafetyProvider } from "@ying-companion/ai-core";
import type { LoreEntry } from "../abstractions/story-definition";
import type { LoreProvider } from "../abstractions/lore-provider";
import type { StoryPlanner } from "../abstractions/story-planner";
import type { StoryRenderer } from "../abstractions/story-renderer";
import type { StorySessionProvider } from "../abstractions/story-session";
import type { StoryStateProvider } from "../abstractions/story-state-provider";
import type { StateTransitionValidator } from "../abstractions/state-transition-validator";
import type {
  StoryWorkflow,
  StoryWorkflowInput,
  StoryWorkflowResult,
} from "../abstractions/story-workflow";
import { applyStoryStateChanges } from "../state/apply-story-state-changes";

export interface DefaultStoryWorkflowOptions {
  sessionProvider: StorySessionProvider;
  stateProvider: StoryStateProvider;
  loreProvider: LoreProvider;
  planner: StoryPlanner;
  validator: StateTransitionValidator;
  renderer: StoryRenderer;
  safety?: SafetyProvider | undefined;
}

export class DefaultStoryWorkflow implements StoryWorkflow {
  private readonly sessionProvider: StorySessionProvider;
  private readonly stateProvider: StoryStateProvider;
  private readonly loreProvider: LoreProvider;
  private readonly planner: StoryPlanner;
  private readonly validator: StateTransitionValidator;
  private readonly renderer: StoryRenderer;
  private readonly safety: SafetyProvider | undefined;

  constructor(options: DefaultStoryWorkflowOptions) {
    this.sessionProvider = options.sessionProvider;
    this.stateProvider = options.stateProvider;
    this.loreProvider = options.loreProvider;
    this.planner = options.planner;
    this.validator = options.validator;
    this.renderer = options.renderer;
    this.safety = options.safety;
  }

  async execute(input: StoryWorkflowInput): Promise<StoryWorkflowResult> {
    await this.guardInput(input);

    const session = await this.sessionProvider.getSession(input.sessionId);
    if (!session) {
      throw new Error(`Story session ${input.sessionId} does not exist`);
    }

    const currentState = await this.stateProvider.getState(input.sessionId);
    if (!currentState) {
      throw new Error(`Story state for session ${input.sessionId} does not exist`);
    }

    const activeCharacterIds = Object.entries(currentState.characters)
      .filter(([, character]) => character.present)
      .map(([characterId]) => characterId);
    const loreResult = await this.loreProvider.recall({
      userInput: input.userInput,
      sceneId: currentState.currentSceneId,
      activeCharacterIds,
      definition: session.definitionSnapshot,
      state: currentState,
    });

    const plan = await this.planner.plan({
      sessionId: input.sessionId,
      userInput: input.userInput,
      definition: session.definitionSnapshot,
      state: currentState,
      recalledLore: loreResult.entries,
    });

    if (plan.rejection && plan.interpretedAction.kind !== "rejected") {
      throw new Error("Story planner rejection requires interpretedAction.kind=rejected");
    }
    if (plan.rejection && plan.stateChanges.length > 0) {
      throw new Error("Story planner rejection must not include stateChanges");
    }
    const loreForRender = resolveLoreForRender(
      loreResult.entries,
      plan.revealedLoreIds,
      session.definitionSnapshot.lore,
    );

    const validation = await this.validator.validate({
      definition: session.definitionSnapshot,
      currentState,
      changes: plan.stateChanges,
    });
    if (!validation.valid) {
      throw new Error(
        `Story state changes rejected: ${validation.errors.map((error) => error.message).join("; ")}`,
      );
    }

    const nextState = applyStoryStateChanges({
      definition: session.definitionSnapshot,
      currentState,
      changes: validation.changes,
    });

    const renderResult = await this.renderer.render({
      sessionId: input.sessionId,
      userInput: input.userInput,
      definition: session.definitionSnapshot,
      currentState,
      nextState,
      plan,
      recalledLore: loreForRender,
    });

    await this.guardOutput(input, renderResult.text);
    await this.stateProvider.saveState(input.sessionId, nextState);

    return {
      text: renderResult.text,
      state: nextState,
      plan,
      recalledLoreIds: loreForRender.map((entry) => entry.id),
      appliedChanges: validation.changes,
    };
  }

  private async guardInput(input: StoryWorkflowInput): Promise<void> {
    if (!this.safety) {
      return;
    }
    const result = await this.safety.guardInput({
      text: input.userInput,
      sessionId: input.sessionId,
      metadata: { mode: "story" },
    });
    if (!result.allowed) {
      throw new Error(
        `Story input rejected by safety provider: ${result.reason ?? "unknown reason"}`,
      );
    }
  }

  private async guardOutput(input: StoryWorkflowInput, text: string): Promise<void> {
    if (!this.safety) {
      return;
    }
    const result = await this.safety.guardOutput({
      text,
      sessionId: input.sessionId,
      metadata: { mode: "story" },
    });
    if (!result.allowed) {
      throw new Error(
        `Story output rejected by safety provider: ${result.reason ?? "unknown reason"}`,
      );
    }
  }
}

function resolveLoreForRender(
  recalledLore: LoreEntry[],
  revealedLoreIds: string[],
  definitionLore: LoreEntry[],
): LoreEntry[] {
  const entriesById = new Map(definitionLore.map((entry) => [entry.id, entry]));
  const result = new Map(recalledLore.map((entry) => [entry.id, entry]));

  for (const loreId of revealedLoreIds) {
    const entry = entriesById.get(loreId);
    if (!entry) {
      throw new Error(`Story planner revealed unknown lore ${loreId}`);
    }
    result.set(entry.id, entry);
  }

  return [...result.values()].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
}
