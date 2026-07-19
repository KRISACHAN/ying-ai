import type { RecalledLoreEntry } from "./lore-provider";
import type { StoryTurnPlan } from "./story-planner";
import type { StoryState } from "./story-state";
import type { CommittedStoryTurn } from "./story-turn";

export interface CommitSuccessfulStoryTurnInput {
  sessionId: string;
  clientTurnId: string;
  expectedStateRevision: number;
  previousState: StoryState;
  nextState: StoryState;
  userInput: string;
  assistantText: string;
  plan: StoryTurnPlan;
  recalledLore: RecalledLoreEntry[];
  stateChanged: boolean;
  now?: Date;
}

export interface StoryTurnCommitter {
  commitSuccessfulTurn(input: CommitSuccessfulStoryTurnInput): Promise<CommittedStoryTurn>;
}
