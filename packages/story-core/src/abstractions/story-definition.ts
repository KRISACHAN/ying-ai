import type { StoryCondition } from "./story-condition";
import type { StoryAttrScope, StoryAttrValue } from "./story-state";

export interface StoryDefinition {
  id: string;
  version: string;
  title: string;
  description: string;
  premise: string;
  genre: string[];
  tone: string[];
  writingStyle?: string;
  playerRole: PlayerRoleDefinition;
  characters: StoryCharacterDefinition[];
  scenes: SceneDefinition[];
  lore: LoreEntry[];
  items: StoryItemDefinition[];
  clues: StoryClueDefinition[];
  events: StoryEventDefinition[];
  openingSceneId: string;
  openingText: string;
  attributes: StoryAttributeDefinition[];
  relationshipsEnabled?: boolean;
  relationshipBounds?: {
    min: number;
    max: number;
  };
  narrativeRules: NarrativeRules;
}

export interface PlayerRoleDefinition {
  name?: string;
  identity: string;
  background?: string;
  knownFacts: string[];
}

export interface StoryCharacterDefinition {
  id: string;
  name: string;
  description: string;
  personality: string[];
  speakingStyle: string;
  publicBackground: string;
  privateBackground?: string;
  secrets?: StorySecret[];
  goals: string[];
  fears?: string[];
  knowledgeScope?: string[];
  forbiddenKnowledge?: string[];
  narrativeRole: "protagonist" | "companion" | "antagonist" | "supporting" | "narrator";
}

export interface StorySecret {
  id: string;
  summary: string;
  loreId?: string;
}

export interface SceneDefinition {
  id: string;
  title: string;
  description: string;
  location?: string;
  availableCharacterIds: string[];
  entryConditions?: StoryCondition[];
  exitConditions?: StoryCondition[];
  eventIds?: string[];
}

export interface StoryItemDefinition {
  id: string;
  name: string;
  description?: string;
}

export interface StoryClueDefinition {
  id: string;
  title: string;
  description?: string;
}

export interface StoryEventDefinition {
  id: string;
  title: string;
  description?: string;
}

export interface LoreEntry {
  id: string;
  title: string;
  content: string;
  keywords?: string[];
  sceneIds?: string[];
  characterIds?: string[];
  activation: "always" | "keyword";
  secret?: boolean;
  priority?: number;
  tokenBudget?: number;
}

export interface NarrativeRules {
  mustFollow: string[];
  mustAvoid: string[];
  pov?: string;
  responseLengthHint?: "short" | "medium" | "long";
}

export interface StoryAttributeDefinition {
  key: string;
  label: string;
  type: "boolean" | "number" | "string" | "enum";
  scope: StoryAttrScope;
  characterIds?: string[];
  required?: boolean;
  default?: StoryAttrValue;
  min?: number;
  max?: number;
  enumValues?: string[];
  maxLength?: number;
  showInSidebar?: boolean;
  writable?: boolean;
  description?: string;
}
