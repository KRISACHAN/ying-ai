import type { StoryState } from "./story-state";

export interface SaveStoryStateOptions {
  expectedRevision?: number;
}

export interface StoryStateProvider {
  getState(sessionId: string): Promise<StoryState | null>;
  saveState(sessionId: string, state: StoryState, options?: SaveStoryStateOptions): Promise<void>;
}
