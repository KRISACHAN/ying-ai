import type { RecalledLoreEntry } from "./lore-provider";
import type { StoryDefinition } from "./story-definition";
import type { StoryMessage } from "./story-message";
import type { StoryTurnPlan } from "./story-planner";
import type { StoryState } from "./story-state";
import type { StoryNarrativeSummary } from "./story-summary";

export interface StoryRenderInput {
  sessionId: string;
  userInput: string;
  definition: StoryDefinition;
  currentState: StoryState;
  nextState: StoryState;
  plan: StoryTurnPlan;
  recalledLore: RecalledLoreEntry[];
  summary?: StoryNarrativeSummary | null;
  recentMessages?: StoryMessage[];
}

export interface StoryRenderResult {
  text: string;
}

export interface StoryRenderer {
  render(input: StoryRenderInput): Promise<StoryRenderResult>;
  stream?(input: StoryRenderInput): AsyncIterable<string>;
}
