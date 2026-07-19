import type { StoryMessage } from "./story-message";

export interface StoryMessageProvider {
  getRecentMessages(
    sessionId: string,
    options?: {
      limit?: number;
      beforeTurnNumber?: number;
    },
  ): Promise<StoryMessage[]>;
}
