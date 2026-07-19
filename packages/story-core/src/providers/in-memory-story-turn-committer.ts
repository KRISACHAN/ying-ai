import type { StoryMessage } from "../abstractions/story-message";
import type {
  CommitSuccessfulStoryTurnInput,
  StoryTurnCommitter,
} from "../abstractions/story-turn-committer";
import type { CommittedStoryTurn } from "../abstractions/story-turn";
import type { StoryStateProvider } from "../abstractions/story-state-provider";
import { StoryWorkflowError } from "../workflow/story-workflow-errors";
import type { InMemoryStoryTurnStore } from "./in-memory-story-turn-store";

export interface InMemoryStoryTurnCommitterOptions {
  store: InMemoryStoryTurnStore;
  stateProvider: StoryStateProvider;
  idFactory?: () => string;
}

export class InMemoryStoryTurnCommitter implements StoryTurnCommitter {
  private readonly idFactory: () => string;

  constructor(private readonly options: InMemoryStoryTurnCommitterOptions) {
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  async commitSuccessfulTurn(input: CommitSuccessfulStoryTurnInput): Promise<CommittedStoryTurn> {
    const existing = this.options.store
      .getRecords(input.sessionId)
      .find((record) => record.turn.clientTurnId === input.clientTurnId)?.turn;
    if (existing?.status === "committed") {
      return existing;
    }

    const currentState = await this.options.stateProvider.getState(input.sessionId);
    if (!currentState || currentState.revision !== input.expectedStateRevision) {
      throw new StoryWorkflowError(
        "STORY_STATE_CONFLICT",
        `Story state revision conflict for session ${input.sessionId}`,
      );
    }

    const records = this.options.store
      .getRecords(input.sessionId)
      .filter((record) => record.turn.clientTurnId !== input.clientTurnId);
    const turnNumber =
      records.reduce((max, record) => Math.max(max, record.turn.turnNumber), 0) + 1;
    const now = (input.now ?? new Date()).toISOString();
    const nextState = {
      ...input.nextState,
      revision: input.expectedStateRevision + 1,
      updatedAt: now,
    };
    await this.options.stateProvider.saveState(input.sessionId, nextState);

    const turnId = this.idFactory();
    const turn: CommittedStoryTurn = {
      id: turnId,
      sessionId: input.sessionId,
      turnNumber,
      clientTurnId: input.clientTurnId,
      status: "committed",
      userInput: input.userInput,
      assistantText: input.assistantText,
      plan: input.plan,
      recalledLore: input.recalledLore,
      previousStateRevision: input.expectedStateRevision,
      nextStateRevision: nextState.revision,
      stateChanged: input.stateChanged,
      createdAt: now,
      committedAt: now,
    };
    const messages: StoryMessage[] = [
      {
        id: this.idFactory(),
        sessionId: input.sessionId,
        turnId,
        role: "user",
        content: input.userInput,
        sequence: turnNumber * 2 - 1,
        createdAt: now,
      },
      {
        id: this.idFactory(),
        sessionId: input.sessionId,
        turnId,
        role: "assistant",
        content: input.assistantText,
        sequence: turnNumber * 2,
        createdAt: now,
      },
    ];

    this.options.store.replaceRecords(input.sessionId, [...records, { turn, messages }]);
    return turn;
  }
}
