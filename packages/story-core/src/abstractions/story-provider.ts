import type { StoryDefinition } from "./story-definition";

export interface StoryProvider {
  getDefinition(storyId: string): Promise<StoryDefinition | null>;
}
