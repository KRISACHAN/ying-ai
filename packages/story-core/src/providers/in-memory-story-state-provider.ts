import type { StoryStateProvider } from "../abstractions/story-state-provider";
import type { StoryState } from "../abstractions/story-state";

export class InMemoryStoryStateProvider implements StoryStateProvider {
  private readonly states = new Map<string, StoryState>();

  async getState(sessionId: string): Promise<StoryState | null> {
    const state = this.states.get(sessionId);
    return state ? cloneState(state) : null;
  }

  async saveState(sessionId: string, state: StoryState): Promise<void> {
    this.states.set(sessionId, cloneState(state));
  }
}

export function cloneState(state: StoryState): StoryState {
  return JSON.parse(JSON.stringify(state)) as StoryState;
}
