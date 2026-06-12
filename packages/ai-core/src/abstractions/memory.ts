import type { CoreProvider } from "./provider";
import type { ChatMessage } from "./model";

export type MemoryType = "fact" | "preference" | "relationship" | "event";

export type MemoryImportance = 1 | 2 | 3 | 4 | 5;

export interface MemoryScope {
  ownerType: "anonymous" | "user" | "session" | "custom";
  ownerId: string;
  companionId?: string;
}

export interface MemorySource {
  conversationId?: string;
  messageIds?: string[];
  reason?: string;
}

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  type: MemoryType;
  content: string;
  importance: MemoryImportance;
  source?: MemorySource;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt?: Date;
}

export type Memory = MemoryRecord;

export interface ExtractedMemory {
  type: MemoryType;
  content: string;
  importance: MemoryImportance;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryRecallInput {
  scope: MemoryScope;
  query: string;
  limit?: number;
  minImportance?: MemoryImportance;
  metadata?: Record<string, unknown>;
}

export interface RecalledMemory extends MemoryRecord {
  score?: number;
}

export interface MemoryRecallResult {
  memories: RecalledMemory[];
}

export interface MemorySaveInput {
  scope: MemoryScope;
  memories: ExtractedMemory[];
  source?: MemorySource;
  metadata?: Record<string, unknown>;
}

export interface MemorySaveResult {
  saved: MemoryRecord[];
  skipped?: ExtractedMemory[];
}

export interface MemoryExtractionInput {
  scope: MemoryScope;
  userMessage: string;
  assistantMessage: string;
  history?: ChatMessage[];
}

export interface MemoryExtractionResult {
  memories: ExtractedMemory[];
}

export interface MemoryProvider extends CoreProvider {
  recall(input: MemoryRecallInput): Promise<MemoryRecallResult>;
  save(input: MemorySaveInput): Promise<MemorySaveResult>;
}

export interface MemoryExtractor extends CoreProvider {
  extract(input: MemoryExtractionInput): Promise<MemoryExtractionResult>;
}

export interface EmbedInput {
  text: string;
}

export interface EmbedResult {
  vector: number[];
  model?: string;
}

export interface EmbeddingProvider extends CoreProvider {
  embed(input: EmbedInput): Promise<EmbedResult>;
}

export function resolveMemoryScope(input: {
  scope?: MemoryScope;
  sessionId?: string;
}): MemoryScope {
  if (input.scope !== undefined) {
    return input.scope;
  }

  if (input.sessionId !== undefined && input.sessionId.trim() !== "") {
    return { ownerType: "session", ownerId: input.sessionId };
  }

  return { ownerType: "session", ownerId: "default" };
}
