import type { LoreEntry, StoryDefinition } from "./story-definition";
import type { StoryState } from "./story-state";

export interface LoreRecallInput {
  userInput: string;
  sceneId: string;
  activeCharacterIds: string[];
  definition: StoryDefinition;
  state: StoryState;
}

export interface LoreRecallResult {
  entries: LoreEntry[];
}

export interface LoreProvider {
  recall(input: LoreRecallInput): Promise<LoreRecallResult>;
}
