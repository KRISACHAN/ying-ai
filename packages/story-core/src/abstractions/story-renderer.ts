import type { LoreEntry, StoryDefinition } from "./story-definition";
import type { StoryTurnPlan } from "./story-planner";
import type { StoryState } from "./story-state";

export interface StoryRenderInput {
  sessionId: string;
  userInput: string;
  definition: StoryDefinition;
  currentState: StoryState;
  nextState: StoryState;
  plan: StoryTurnPlan;
  recalledLore: LoreEntry[];
}

export interface StoryRenderResult {
  text: string;
}

export interface StoryRenderer {
  render(input: StoryRenderInput): Promise<StoryRenderResult>;
}
