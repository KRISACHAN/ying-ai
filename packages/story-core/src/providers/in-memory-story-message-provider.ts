import type { StoryMessage } from "../abstractions/story-message";
import type { StoryMessageProvider } from "../abstractions/story-message-provider";
import type { InMemoryStoryTurnStore } from "./in-memory-story-turn-store";

export class InMemoryStoryMessageProvider implements StoryMessageProvider {
  constructor(private readonly store: InMemoryStoryTurnStore) {}

  async getRecentMessages(
    sessionId: string,
    options?: { limit?: number; beforeTurnNumber?: number },
  ): Promise<StoryMessage[]> {
    const messages = this.store
      .getRecords(sessionId)
      .filter((record) => record.turn.status === "committed")
      .filter(
        (record) =>
          options?.beforeTurnNumber === undefined ||
          record.turn.turnNumber < options.beforeTurnNumber,
      )
      .sort((left, right) => left.turn.turnNumber - right.turn.turnNumber)
      .flatMap((record) =>
        [...record.messages].sort((left, right) => left.sequence - right.sequence),
      );

    return options?.limit ? messages.slice(-options.limit) : messages;
  }
}
