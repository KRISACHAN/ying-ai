import type { RecalledLoreEntry } from "./lore-provider";
import type { StoryDefinition } from "./story-definition";
import type { StoryState } from "./story-state";
import type { StoryStateChange } from "./story-state-change";

export interface StoryAction {
  raw: string;
  summary: string;
  kind: "dialogue" | "investigate" | "travel" | "use_item" | "other" | "rejected";
}

export interface StoryActionRejection {
  reason: string;
  inWorldGuidance: string;
}

export interface NarrativeBeat {
  summary: string;
  tension?: "low" | "medium" | "high";
}

export interface StoryTurnPlan {
  interpretedAction: StoryAction;
  activeCharacterIds: string[];
  narrativeBeat: NarrativeBeat;
  stateChanges: StoryStateChange[];
  triggeredEventIds: string[];
  revealedLoreIds: string[];
  rejection?: StoryActionRejection;
  responseGuidance: {
    narratorFocus: string;
    emotionalTone: string;
    mustInclude: string[];
    mustNotReveal: string[];
  };
}

export interface StoryPlannerInput {
  sessionId: string;
  userInput: string;
  definition: StoryDefinition;
  state: StoryState;
  recalledLore: RecalledLoreEntry[];
}

export interface StoryPlanner {
  plan(input: StoryPlannerInput): Promise<StoryTurnPlan>;
}
