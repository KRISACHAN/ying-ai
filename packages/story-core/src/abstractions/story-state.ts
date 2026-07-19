export type StoryAttrScope = "story" | "player" | "character" | "scene";
export type StoryAttrValue = boolean | number | string;

export interface StoryCharacterState {
  alive: boolean;
  present: boolean;
}

export interface StoryState {
  schemaVersion: 1;
  storyId: string;
  definitionVersion: string;
  revision: number;
  currentSceneId: string;
  characters: Record<string, StoryCharacterState>;
  inventory: string[];
  clues: string[];
  events: string[];
  revealedLoreIds: string[];
  relationships?: Record<string, number>;
  attrs: Record<string, StoryAttrValue>;
  updatedAt: string;
}
