import type { SafetyProvider } from "@ying-companion/ai-core";
import type {
  StoryEventBase,
  StoryWorkflowEvent,
  StoryObserver,
} from "../abstractions/story-event";
import type { RecalledLoreEntry } from "../abstractions/lore-provider";
import type { LoreProvider } from "../abstractions/lore-provider";
import type { StoryMessageProvider } from "../abstractions/story-message-provider";
import type { StoryPlanner, StoryTurnPlan } from "../abstractions/story-planner";
import type { StoryRenderer } from "../abstractions/story-renderer";
import type { StorySessionProvider } from "../abstractions/story-session";
import type { StoryState } from "../abstractions/story-state";
import type { StoryStateChange } from "../abstractions/story-state-change";
import type { StoryStateProvider } from "../abstractions/story-state-provider";
import type { StorySummaryProvider } from "../abstractions/story-summary";
import type { StoryTurnCommitter } from "../abstractions/story-turn-committer";
import type { StoryTurnRepository } from "../abstractions/story-turn-repository";
import type { StateTransitionValidator } from "../abstractions/state-transition-validator";
import type {
  StoryWorkflow,
  StoryWorkflowInput,
  StoryWorkflowResult,
} from "../abstractions/story-workflow";
import { InMemoryStoryMessageProvider } from "../providers/in-memory-story-message-provider";
import { InMemoryStoryStateProvider } from "../providers/in-memory-story-state-provider";
import { InMemoryStoryTurnCommitter } from "../providers/in-memory-story-turn-committer";
import { InMemoryStoryTurnRepository } from "../providers/in-memory-story-turn-repository";
import { InMemoryStoryTurnStore } from "../providers/in-memory-story-turn-store";
import { applyStoryStateChanges } from "../state/apply-story-state-changes";
import { FakeStorySummaryProvider } from "../summary/fake-story-summary-provider";
import { StoryWorkflowError, type StoryWorkflowErrorCode } from "./story-workflow-errors";

export interface DefaultStoryWorkflowOptions {
  sessionProvider: StorySessionProvider;
  stateProvider: StoryStateProvider;
  loreProvider: LoreProvider;
  planner: StoryPlanner;
  validator: StateTransitionValidator;
  renderer: StoryRenderer;
  committer?: StoryTurnCommitter;
  turnRepository?: StoryTurnRepository;
  messageProvider?: StoryMessageProvider;
  summaryProvider?: StorySummaryProvider;
  safety?: SafetyProvider | undefined;
  observer?: StoryObserver | undefined;
  recentMessageLimit?: number;
  runIdFactory?: () => string;
}

export class DefaultStoryWorkflow implements StoryWorkflow {
  private readonly sessionProvider: StorySessionProvider;
  private readonly stateProvider: StoryStateProvider;
  private readonly loreProvider: LoreProvider;
  private readonly planner: StoryPlanner;
  private readonly validator: StateTransitionValidator;
  private readonly renderer: StoryRenderer;
  private readonly committer: StoryTurnCommitter;
  private readonly turnRepository: StoryTurnRepository;
  private readonly messageProvider: StoryMessageProvider;
  private readonly summaryProvider: StorySummaryProvider;
  private readonly safety: SafetyProvider | undefined;
  private readonly observer: StoryObserver | undefined;
  private readonly recentMessageLimit: number;
  private readonly runIdFactory: () => string;

  constructor(options: DefaultStoryWorkflowOptions) {
    this.sessionProvider = options.sessionProvider;
    this.stateProvider = options.stateProvider;
    this.loreProvider = options.loreProvider;
    this.planner = options.planner;
    this.validator = options.validator;
    this.renderer = options.renderer;
    this.safety = options.safety;
    this.observer = options.observer;
    this.recentMessageLimit = options.recentMessageLimit ?? 12;
    this.runIdFactory = options.runIdFactory ?? (() => crypto.randomUUID());

    const hasTurnPersistenceGroup =
      Boolean(options.turnRepository) ||
      Boolean(options.messageProvider) ||
      Boolean(options.committer);
    const hasCompleteTurnPersistenceGroup =
      Boolean(options.turnRepository) &&
      Boolean(options.messageProvider) &&
      Boolean(options.committer);

    if (hasTurnPersistenceGroup && !hasCompleteTurnPersistenceGroup) {
      throw new Error(
        "DefaultStoryWorkflow requires turnRepository, messageProvider, and committer to be provided together",
      );
    }

    if (hasCompleteTurnPersistenceGroup) {
      this.turnRepository = options.turnRepository!;
      this.messageProvider = options.messageProvider!;
      this.committer = options.committer!;
    } else {
      if (!(options.stateProvider instanceof InMemoryStoryStateProvider)) {
        throw new Error(
          "DefaultStoryWorkflow only creates default turn persistence for InMemoryStoryStateProvider; provide turnRepository, messageProvider, and committer for persistent state providers",
        );
      }
      const defaultStore = new InMemoryStoryTurnStore();
      this.turnRepository = new InMemoryStoryTurnRepository(defaultStore);
      this.messageProvider = new InMemoryStoryMessageProvider(defaultStore);
      this.committer = new InMemoryStoryTurnCommitter({
        store: defaultStore,
        stateProvider: this.stateProvider,
      });
    }
    this.summaryProvider = options.summaryProvider ?? new FakeStorySummaryProvider();
  }

  async execute(input: StoryWorkflowInput): Promise<StoryWorkflowResult> {
    return this.run(input, { preferStreamingRenderer: false });
  }

  async *stream(input: StoryWorkflowInput): AsyncIterable<StoryWorkflowEvent> {
    const queue: StoryWorkflowEvent[] = [];
    let notify: (() => void) | undefined;
    let finished = false;
    let failure: unknown;

    const run = this.run(input, {
      preferStreamingRenderer: true,
      onEvent: (event) => {
        queue.push(event);
        notify?.();
      },
    })
      .catch((error: unknown) => {
        failure = error;
      })
      .finally(() => {
        finished = true;
        notify?.();
      });

    while (!finished || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
        notify = undefined;
        continue;
      }
      yield queue.shift()!;
    }

    await run;
    if (failure) {
      throw failure;
    }
  }

  private async run(
    input: StoryWorkflowInput,
    options: { preferStreamingRenderer: boolean; onEvent?: (event: StoryWorkflowEvent) => void },
  ): Promise<StoryWorkflowResult> {
    const context = new StoryRunContext({
      runId: this.runIdFactory(),
      sessionId: input.sessionId,
      clientTurnId: input.clientTurnId,
      ...(input.now ? { now: input.now } : {}),
      ...(this.observer ? { observer: this.observer } : {}),
      ...(options.onEvent ? { onEvent: options.onEvent } : {}),
    });

    try {
      context.throwIfAborted(input.signal);
      await context.emit({ type: "story:start" });
      await this.guardInput(input);

      const session = await this.sessionProvider.getSession(input.sessionId);
      if (!session) {
        throw new StoryWorkflowError(
          "STORY_SESSION_NOT_FOUND",
          `Story session ${input.sessionId} does not exist`,
        );
      }
      await context.emit({
        type: "story:session-loaded",
        storyId: session.storyId,
        definitionVersion: session.definitionVersion,
      });

      const currentState = await this.stateProvider.getState(input.sessionId);
      if (!currentState) {
        throw new StoryWorkflowError(
          "STORY_STATE_INVALID",
          `Story state for session ${input.sessionId} does not exist`,
        );
      }
      await context.emit({ type: "story:state-loaded", revision: currentState.revision });

      const committed = await this.turnRepository.getCommittedByClientTurnId(
        input.sessionId,
        input.clientTurnId,
      );
      if (committed) {
        await context.emit({
          type: "story:committed",
          turnId: committed.id,
          turnNumber: committed.turnNumber,
          stateRevision: committed.nextStateRevision,
        });
        await context.emit({ type: "story:finish" });
        return {
          sessionId: input.sessionId,
          turnId: committed.id,
          clientTurnId: input.clientTurnId,
          assistantText: committed.assistantText,
          previousState: currentState,
          nextState: currentState,
          plan: committed.plan,
          recalledLore: committed.recalledLore,
          committed: true,
          summaryStatus: "unchanged",
          stateChanged: committed.stateChanged,
          stateSnapshotStatus: "current_latest",
          events: context.events,
          text: committed.assistantText,
          state: currentState,
          recalledLoreIds: committed.recalledLore.map((entry) => entry.entry.id),
          appliedChanges: committed.plan.stateChanges,
        };
      }

      const summary = await this.summaryProvider.getSummary(input.sessionId);
      await context.emit({ type: "story:summary-loaded", summaryPresent: Boolean(summary) });
      const recentMessages = await this.messageProvider.getRecentMessages(input.sessionId, {
        limit: this.recentMessageLimit,
      });

      const activeCharacterIds = Object.entries(currentState.characters)
        .filter(([, character]) => character.present)
        .map(([characterId]) => characterId);
      const loreResult = await this.loreProvider.recall({
        userInput: input.userInput,
        currentSceneId: currentState.currentSceneId,
        activeCharacterIds,
        definition: session.definitionSnapshot,
        state: currentState,
        revealedLoreIds: currentState.revealedLoreIds,
      });
      const automaticRevealChanges = getAutomaticRevealChanges({
        state: currentState,
        recalledLore: loreResult.entries,
      });
      const automaticRevealValidation =
        automaticRevealChanges.length > 0
          ? await this.validator.validate({
              definition: session.definitionSnapshot,
              currentState,
              changes: automaticRevealChanges,
            })
          : undefined;
      if (automaticRevealValidation && !automaticRevealValidation.valid) {
        await context.emit({
          type: "story:validation-failed",
          errors: automaticRevealValidation.errors,
        });
        throw new StoryWorkflowError(
          "STORY_STATE_CHANGE_REJECTED",
          `Automatic lore reveal rejected: ${automaticRevealValidation.errors
            .map((error) => error.message)
            .join("; ")}`,
        );
      }
      const plannerState =
        automaticRevealValidation && automaticRevealValidation.changes.length > 0
          ? applyStoryStateChanges({
              definition: session.definitionSnapshot,
              currentState,
              changes: automaticRevealValidation.changes,
              ...(input.now ? { now: input.now } : {}),
            })
          : currentState;
      await context.emit({ type: "story:lore-recalled", recalledLore: loreResult.entries });
      await context.emit({
        type: "story:context-ready",
        summaryPresent: Boolean(summary),
        recentMessageCount: recentMessages.length,
        recalledLoreIds: loreResult.entries.map((entry) => entry.entry.id),
      });

      context.throwIfAborted(input.signal);
      await context.emit({ type: "story:plan-started" });
      const plan = await this.planTurn(
        input,
        session.definitionSnapshot,
        plannerState,
        loreResult.entries,
        summary,
        recentMessages,
      );
      await context.emit({ type: "story:plan-completed", plan });

      assertPlanShape(plan);
      const candidateChanges = mergeCandidateChanges(
        automaticRevealValidation?.changes ?? [],
        plan.stateChanges,
        plan.revealedLoreIds,
        currentState,
      );
      const validation = await this.validator.validate({
        definition: session.definitionSnapshot,
        currentState,
        changes: candidateChanges,
      });
      if (!validation.valid) {
        await context.emit({ type: "story:validation-failed", errors: validation.errors });
        throw new StoryWorkflowError(
          "STORY_STATE_CHANGE_REJECTED",
          `Story state changes rejected: ${validation.errors
            .map((error) => error.message)
            .join("; ")}`,
        );
      }

      const preparedState = applyStoryStateChanges({
        definition: session.definitionSnapshot,
        currentState,
        changes: validation.changes,
        ...(input.now ? { now: input.now } : {}),
      });
      const stateChanged = validation.changes.length > 0;
      await context.emit({
        type: "story:state-prepared",
        previousRevision: currentState.revision,
        nextRevision: currentState.revision + 1,
        stateChanged,
      });

      const rendererLore = getRendererLore({
        recalledLore: loreResult.entries,
        plan,
        currentState,
        definitionLore: session.definitionSnapshot.lore,
      });
      await context.emit({ type: "story:render-started" });
      context.throwIfAborted(input.signal);
      const assistantText = await this.renderTurn({
        input,
        previousState: currentState,
        nextState: preparedState,
        definition: session.definitionSnapshot,
        plan,
        recalledLore: rendererLore,
        summary,
        recentMessages,
        context,
        preferStreamingRenderer: options.preferStreamingRenderer,
      });
      await context.emit({ type: "story:render-completed", assistantText });
      await this.guardOutput(input, assistantText);
      context.throwIfAborted(input.signal);

      const committedTurn = await this.committer.commitSuccessfulTurn({
        sessionId: input.sessionId,
        clientTurnId: input.clientTurnId,
        expectedStateRevision: currentState.revision,
        previousState: currentState,
        nextState: preparedState,
        userInput: input.userInput,
        assistantText,
        plan: { ...plan, stateChanges: validation.changes },
        recalledLore: loreResult.entries,
        stateChanged,
        ...(input.now ? { now: input.now } : {}),
      });
      const nextState = (await this.stateProvider.getState(input.sessionId)) ?? {
        ...preparedState,
        revision: currentState.revision + 1,
      };
      await context.emit({
        type: "story:committed",
        turnId: committedTurn.id,
        turnNumber: committedTurn.turnNumber,
        stateRevision: committedTurn.nextStateRevision,
      });

      const summaryStatus = await this.updateSummary({
        previousSummary: summary,
        committedTurn,
        currentState: nextState,
        definition: session.definitionSnapshot,
        context,
        ...(input.now ? { now: input.now } : {}),
      });
      await context.emit({ type: "story:finish" });

      return {
        sessionId: input.sessionId,
        turnId: committedTurn.id,
        clientTurnId: input.clientTurnId,
        assistantText,
        previousState: currentState,
        nextState,
        plan: { ...plan, stateChanges: validation.changes },
        recalledLore: loreResult.entries,
        committed: true,
        summaryStatus,
        stateChanged,
        stateSnapshotStatus: "turn_snapshot",
        events: context.events,
        text: assistantText,
        state: nextState,
        recalledLoreIds: rendererLore.map((entry) => entry.entry.id),
        appliedChanges: validation.changes,
      };
    } catch (error) {
      const workflowError = normalizeWorkflowError(error);
      await context.emit({
        type: "story:error",
        code: workflowError.code,
        error,
      });
      throw workflowError;
    }
  }

  private async planTurn(
    input: StoryWorkflowInput,
    definition: Parameters<StoryPlanner["plan"]>[0]["definition"],
    state: StoryState,
    recalledLore: RecalledLoreEntry[],
    summary: Awaited<ReturnType<StorySummaryProvider["getSummary"]>>,
    recentMessages: Awaited<ReturnType<StoryMessageProvider["getRecentMessages"]>>,
  ): Promise<StoryTurnPlan> {
    try {
      return await this.planner.plan({
        sessionId: input.sessionId,
        userInput: input.userInput,
        definition,
        state,
        recalledLore,
        summary,
        recentMessages,
      });
    } catch (error) {
      throw new StoryWorkflowError("STORY_PLANNING_FAILED", "Story planner failed", {
        cause: error,
      });
    }
  }

  private async renderTurn(input: {
    input: StoryWorkflowInput;
    previousState: StoryState;
    nextState: StoryState;
    definition: Parameters<StoryRenderer["render"]>[0]["definition"];
    plan: StoryTurnPlan;
    recalledLore: RecalledLoreEntry[];
    summary: Awaited<ReturnType<StorySummaryProvider["getSummary"]>>;
    recentMessages: Awaited<ReturnType<StoryMessageProvider["getRecentMessages"]>>;
    context: StoryRunContext;
    preferStreamingRenderer: boolean;
  }): Promise<string> {
    try {
      if (input.preferStreamingRenderer && this.renderer.stream) {
        let text = "";
        for await (const delta of this.renderer.stream({
          sessionId: input.input.sessionId,
          userInput: input.input.userInput,
          definition: input.definition,
          currentState: input.previousState,
          nextState: input.nextState,
          plan: input.plan,
          recalledLore: input.recalledLore,
          summary: input.summary,
          recentMessages: input.recentMessages,
        })) {
          input.context.throwIfAborted(input.input.signal);
          text += delta;
          await input.context.emit({ type: "story:text-delta", delta });
        }
        return text;
      }

      const result = await this.renderer.render({
        sessionId: input.input.sessionId,
        userInput: input.input.userInput,
        definition: input.definition,
        currentState: input.previousState,
        nextState: input.nextState,
        plan: input.plan,
        recalledLore: input.recalledLore,
        summary: input.summary,
        recentMessages: input.recentMessages,
      });
      await input.context.emit({ type: "story:text-delta", delta: result.text });
      return result.text;
    } catch (error) {
      throw new StoryWorkflowError("STORY_RENDER_FAILED", "Story renderer failed", {
        cause: error,
      });
    }
  }

  private async updateSummary(input: {
    previousSummary: Awaited<ReturnType<StorySummaryProvider["getSummary"]>>;
    committedTurn: Parameters<
      StorySummaryProvider["updateSummary"]
    >[0]["newlyCommittedTurns"][number];
    currentState: StoryState;
    definition: Parameters<StorySummaryProvider["updateSummary"]>[0]["definition"];
    context: StoryRunContext;
    now?: Date;
  }): Promise<"updated" | "unchanged" | "failed"> {
    try {
      await this.summaryProvider.updateSummary({
        previousSummary: input.previousSummary,
        newlyCommittedTurns: [input.committedTurn],
        recentMessages: [],
        currentState: input.currentState,
        definition: input.definition,
        ...(input.now ? { now: input.now } : {}),
      });
      await input.context.emit({ type: "story:summary-updated", status: "updated" });
      return "updated";
    } catch (error) {
      await input.context.emit({ type: "story:summary-updated", status: "failed" });
      await input.context.emit({
        type: "story:error",
        code: "STORY_SUMMARY_FAILED",
        error,
      });
      return "failed";
    }
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
      throw new StoryWorkflowError(
        "STORY_INPUT_REJECTED",
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
      throw new StoryWorkflowError(
        "STORY_OUTPUT_REJECTED",
        `Story output rejected by safety provider: ${result.reason ?? "unknown reason"}`,
      );
    }
  }
}

class StoryRunContext {
  readonly events: StoryWorkflowEvent[] = [];
  private sequence = 0;
  private readonly runId: string;
  private readonly sessionId: string;
  private readonly clientTurnId: string;
  private readonly now: Date | undefined;
  private readonly observer: StoryObserver | undefined;
  private readonly onEvent: ((event: StoryWorkflowEvent) => void) | undefined;

  constructor(input: {
    runId: string;
    sessionId: string;
    clientTurnId: string;
    now?: Date;
    observer?: StoryObserver;
    onEvent?: (event: StoryWorkflowEvent) => void;
  }) {
    this.runId = input.runId;
    this.sessionId = input.sessionId;
    this.clientTurnId = input.clientTurnId;
    this.now = input.now;
    this.observer = input.observer;
    this.onEvent = input.onEvent;
  }

  async emit(event: Omit<StoryWorkflowEvent, keyof StoryEventBase>): Promise<void> {
    const fullEvent = {
      ...event,
      runId: this.runId,
      sessionId: this.sessionId,
      clientTurnId: this.clientTurnId,
      sequence: ++this.sequence,
      occurredAt: this.now ?? new Date(),
    } as StoryWorkflowEvent;
    this.events.push(fullEvent);
    this.onEvent?.(fullEvent);
    await this.observer?.onStoryEvent(fullEvent);
  }

  throwIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) {
      throw new StoryWorkflowError("STORY_ABORTED", "Story workflow aborted");
    }
  }
}

function assertPlanShape(plan: StoryTurnPlan): void {
  if (plan.rejection && plan.interpretedAction.kind !== "rejected") {
    throw new StoryWorkflowError(
      "STORY_PLAN_INVALID",
      "Story planner rejection requires interpretedAction.kind=rejected",
    );
  }
  if (plan.rejection && plan.stateChanges.length > 0) {
    throw new StoryWorkflowError(
      "STORY_PLAN_INVALID",
      "Story planner rejection must not include stateChanges",
    );
  }
}

function getAutomaticRevealChanges(input: {
  state: StoryState;
  recalledLore: RecalledLoreEntry[];
}): StoryStateChange[] {
  return input.recalledLore
    .filter((entry) => entry.entry.secret)
    .filter((entry) => entry.visibility === "planner_and_renderer")
    .filter((entry) => !input.state.revealedLoreIds.includes(entry.entry.id))
    .map((entry) => ({ type: "add_revealed_lore", loreId: entry.entry.id }));
}

function mergeCandidateChanges(
  automaticRevealChanges: StoryStateChange[],
  planChanges: StoryStateChange[],
  planRevealedLoreIds: string[],
  currentState: StoryState,
): StoryStateChange[] {
  const changes = [...automaticRevealChanges, ...planChanges];
  const existingChangeLoreIds = new Set(
    changes
      .filter(
        (change): change is Extract<StoryStateChange, { type: "add_revealed_lore" }> =>
          change.type === "add_revealed_lore",
      )
      .map((change) => change.loreId),
  );
  for (const loreId of planRevealedLoreIds) {
    if (currentState.revealedLoreIds.includes(loreId) || existingChangeLoreIds.has(loreId)) {
      continue;
    }
    changes.push({ type: "add_revealed_lore", loreId });
    existingChangeLoreIds.add(loreId);
  }
  return changes;
}

function getRendererLore(input: {
  recalledLore: RecalledLoreEntry[];
  plan: StoryTurnPlan;
  currentState: StoryState;
  definitionLore: Parameters<StoryRenderer["render"]>[0]["definition"]["lore"];
}): RecalledLoreEntry[] {
  const result = new Map(
    input.recalledLore
      .filter((entry) => entry.visibility === "planner_and_renderer")
      .map((entry) => [entry.entry.id, entry]),
  );
  const entriesById = new Map(input.definitionLore.map((entry) => [entry.id, entry]));

  for (const loreId of input.plan.revealedLoreIds) {
    if (input.currentState.revealedLoreIds.includes(loreId)) {
      continue;
    }
    const entry = entriesById.get(loreId);
    if (!entry) {
      continue;
    }
    result.set(loreId, {
      entry,
      visibility: "planner_and_renderer",
      activationReason: ["plan_reveal"],
      priority: entry.priority ?? 0,
      estimatedTokens: Math.max(1, Math.ceil(entry.content.length / 4)),
    });
  }

  return [...result.values()].sort((left, right) => right.priority - left.priority);
}

function normalizeWorkflowError(error: unknown): StoryWorkflowError {
  if (error instanceof StoryWorkflowError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new StoryWorkflowError(inferCode(message), message, { cause: error });
}

function inferCode(message: string): StoryWorkflowErrorCode {
  if (message.includes("revision conflict")) {
    return "STORY_STATE_CONFLICT";
  }
  return "STORY_PERSIST_FAILED";
}
