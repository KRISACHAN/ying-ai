import type {
  StoryNarrativeSummary,
  StorySummaryProvider,
  StorySummaryUpdateInput,
} from "../abstractions/story-summary";

export class FakeStorySummaryProvider implements StorySummaryProvider {
  private readonly summaries = new Map<string, StoryNarrativeSummary>();

  constructor(private readonly options: { failUpdates?: boolean } = {}) {}

  async getSummary(sessionId: string): Promise<StoryNarrativeSummary | null> {
    const summary = this.summaries.get(sessionId);
    return summary ? clone(summary) : null;
  }

  async updateSummary(input: StorySummaryUpdateInput): Promise<StoryNarrativeSummary> {
    if (this.options.failUpdates) {
      throw new Error("Fake story summary update failed");
    }
    const lastTurn = input.newlyCommittedTurns.at(-1);
    const sessionId = lastTurn?.sessionId ?? input.previousSummary?.sessionId;
    if (!sessionId) {
      throw new Error("Cannot update story summary without a session id");
    }
    const text = [
      input.previousSummary?.text,
      ...input.newlyCommittedTurns.map(
        (turn) => `Turn ${turn.turnNumber}: ${turn.userInput} -> ${turn.assistantText}`,
      ),
    ]
      .filter(Boolean)
      .join("\n");
    const summary: StoryNarrativeSummary = {
      sessionId,
      throughTurnNumber: lastTurn?.turnNumber ?? input.previousSummary?.throughTurnNumber ?? 0,
      text,
      version: (input.previousSummary?.version ?? 0) + 1,
      updatedAt: (input.now ?? new Date()).toISOString(),
    };
    this.summaries.set(sessionId, clone(summary));
    return clone(summary);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
