import type { CommittedStoryTurn, StoryTurn } from "./story-turn";

export interface StoryTurnRepository {
  getByClientTurnId(sessionId: string, clientTurnId: string): Promise<StoryTurn | null>;
  getCommittedByClientTurnId(
    sessionId: string,
    clientTurnId: string,
  ): Promise<CommittedStoryTurn | null>;
  getCommittedTurns(
    sessionId: string,
    options?: { afterTurnNumber?: number; limit?: number },
  ): Promise<CommittedStoryTurn[]>;
}
