import type { StoryDefinition } from "./story-definition";

export interface StorySession {
  id: string;
  storyId: string;
  definitionSnapshot: StoryDefinition;
  definitionVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorySessionProvider {
  createSession(input: { storyId: string }): Promise<StorySession>;
  getSession(sessionId: string): Promise<StorySession | null>;
}
