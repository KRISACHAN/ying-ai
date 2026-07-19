import type { StoryDefinition } from "./story-definition";
import type { StoryMessage } from "./story-message";
import type { StoryState } from "./story-state";
import type { CommittedStoryTurn } from "./story-turn";

export interface StoryNarrativeSummary {
  sessionId: string;
  throughTurnNumber: number;
  text: string;
  version: number;
  updatedAt: string;
}

export interface StorySummaryUpdateInput {
  previousSummary: StoryNarrativeSummary | null;
  newlyCommittedTurns: CommittedStoryTurn[];
  recentMessages: StoryMessage[];
  currentState: StoryState;
  definition: StoryDefinition;
  now?: Date;
}

export interface StorySummaryProvider {
  getSummary(sessionId: string): Promise<StoryNarrativeSummary | null>;
  updateSummary(input: StorySummaryUpdateInput): Promise<StoryNarrativeSummary>;
}
