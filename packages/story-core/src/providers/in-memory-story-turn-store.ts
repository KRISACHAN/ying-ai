import type { StoryMessage } from "../abstractions/story-message";
import type { StoryTurn } from "../abstractions/story-turn";

export interface InMemoryStoryTurnStoreRecord {
  turn: StoryTurn;
  messages: StoryMessage[];
}

export class InMemoryStoryTurnStore {
  private readonly records = new Map<string, InMemoryStoryTurnStoreRecord[]>();

  getRecords(sessionId: string): InMemoryStoryTurnStoreRecord[] {
    return (this.records.get(sessionId) ?? []).map(cloneRecord);
  }

  replaceRecords(sessionId: string, records: InMemoryStoryTurnStoreRecord[]): void {
    this.records.set(sessionId, records.map(cloneRecord));
  }
}

function cloneRecord(record: InMemoryStoryTurnStoreRecord): InMemoryStoryTurnStoreRecord {
  return JSON.parse(JSON.stringify(record)) as InMemoryStoryTurnStoreRecord;
}
