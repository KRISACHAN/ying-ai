import type { CommittedStoryTurn, StoryTurn } from "../abstractions/story-turn";
import type { StoryTurnRepository } from "../abstractions/story-turn-repository";
import type { InMemoryStoryTurnStore } from "./in-memory-story-turn-store";

export class InMemoryStoryTurnRepository implements StoryTurnRepository {
  constructor(private readonly store: InMemoryStoryTurnStore) {}

  async getByClientTurnId(sessionId: string, clientTurnId: string): Promise<StoryTurn | null> {
    return (
      this.store.getRecords(sessionId).find((record) => record.turn.clientTurnId === clientTurnId)
        ?.turn ?? null
    );
  }

  async getCommittedByClientTurnId(
    sessionId: string,
    clientTurnId: string,
  ): Promise<CommittedStoryTurn | null> {
    const turn = await this.getByClientTurnId(sessionId, clientTurnId);
    return turn?.status === "committed" ? turn : null;
  }

  async getCommittedTurns(
    sessionId: string,
    options?: { afterTurnNumber?: number; limit?: number },
  ): Promise<CommittedStoryTurn[]> {
    const afterTurnNumber = options?.afterTurnNumber ?? 0;
    const turns = this.store
      .getRecords(sessionId)
      .map((record) => record.turn)
      .filter((turn): turn is CommittedStoryTurn => turn.status === "committed")
      .filter((turn) => turn.turnNumber > afterTurnNumber)
      .sort((left, right) => left.turnNumber - right.turnNumber);
    return options?.limit ? turns.slice(0, options.limit) : turns;
  }
}
