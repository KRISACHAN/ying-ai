import type { StoryState } from "./story-state";

export interface StoryStateProvider {
  getState(sessionId: string): Promise<StoryState | null>;
  saveState(sessionId: string, state: StoryState): Promise<void>;
}
