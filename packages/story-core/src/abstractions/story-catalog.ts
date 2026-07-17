import type { StoryDefinition } from "./story-definition";

export interface StoryCatalogEntry {
  id: string;
  version: string;
  title: string;
  description: string;
}

export interface StoryCatalog {
  listDefinitions(): Promise<StoryCatalogEntry[]>;
  getDefinition(storyId: string): Promise<StoryDefinition | null>;
}
