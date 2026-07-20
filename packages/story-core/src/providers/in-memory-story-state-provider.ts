import type { StoryStateProvider } from "../abstractions/story-state-provider";
import type { StoryState } from "../abstractions/story-state";

export class InMemoryStoryStateProvider implements StoryStateProvider {
  private readonly states = new Map<string, StoryState>();

  async getState(sessionId: string): Promise<StoryState | null> {
    const state = this.states.get(sessionId);
    return state ? cloneState(state) : null;
  }

  async saveState(
    sessionId: string,
    state: StoryState,
    options?: { expectedRevision?: number },
  ): Promise<void> {
    const current = this.states.get(sessionId);
    if (
      options?.expectedRevision !== undefined &&
      (!current || current.revision !== options.expectedRevision)
    ) {
      throw new Error(`Story state revision conflict for session ${sessionId}`);
    }
    this.states.set(sessionId, cloneState(state));
  }
}

export function cloneState(state: StoryState): StoryState {
  return JSON.parse(JSON.stringify(state)) as StoryState;
}
