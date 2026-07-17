import type { StoryState } from "./story-state";
import type { StoryStateChange } from "./story-state-change";
import type { StoryTurnPlan } from "./story-planner";

export interface StoryWorkflowInput {
  sessionId: string;
  userInput: string;
}

export interface StoryWorkflowResult {
  text: string;
  state: StoryState;
  plan: StoryTurnPlan;
  recalledLoreIds: string[];
  appliedChanges: StoryStateChange[];
}

export interface StoryWorkflow {
  execute(input: StoryWorkflowInput): Promise<StoryWorkflowResult>;
}
