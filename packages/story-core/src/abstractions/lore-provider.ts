import type { LoreEntry, StoryDefinition } from "./story-definition";
import type { StoryState } from "./story-state";

export interface LoreRecallInput {
  userInput: string;
  sceneId?: string;
  currentSceneId?: string;
  activeCharacterIds: string[];
  definition: StoryDefinition;
  state: StoryState;
  revealedLoreIds?: string[];
  maxEntries?: number;
  totalTokenBudget?: number;
}

export interface RecalledLoreEntry {
  entry: LoreEntry;
  visibility: "planner_only" | "planner_and_renderer";
  activationReason: string[];
  priority: number;
  estimatedTokens: number;
}

export interface LoreRecallResult {
  entries: RecalledLoreEntry[];
  filtered?: Array<{ loreId: string; reason: string }>;
}

export interface LoreProvider {
  recall(input: LoreRecallInput): Promise<LoreRecallResult>;
}
