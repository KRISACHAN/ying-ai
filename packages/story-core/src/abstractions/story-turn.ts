import type { RecalledLoreEntry } from "./lore-provider";
import type { StoryTurnPlan } from "./story-planner";

export interface CommittedStoryTurn {
  id: string;
  sessionId: string;
  turnNumber: number;
  clientTurnId: string;
  status: "committed";
  userInput: string;
  assistantText: string;
  plan: StoryTurnPlan;
  recalledLore: RecalledLoreEntry[];
  previousStateRevision: number;
  nextStateRevision: number;
  stateChanged: boolean;
  createdAt: string;
  committedAt: string;
}

export interface FailedStoryTurn {
  id: string;
  sessionId: string;
  turnNumber: number;
  clientTurnId: string;
  status: "failed";
  userInput: string;
  assistantText?: string;
  plan?: StoryTurnPlan;
  recalledLore?: RecalledLoreEntry[];
  previousStateRevision: number;
  nextStateRevision?: number;
  error: {
    code: string;
    message: string;
  };
  createdAt: string;
  committedAt?: string;
}

export type StoryTurn = CommittedStoryTurn | FailedStoryTurn;
