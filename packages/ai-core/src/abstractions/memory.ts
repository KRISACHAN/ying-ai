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
  /**
   * 可选调试信息：本次 recall 使用的 query embedding 维度。
   * 仅供宿主调试展示（patch-0 §5.4），不属于业务契约；
   * 进程内 / Noop provider 可不返回。
   */
  embeddingVectorLength?: number;
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
  /**
   * 可选调试信息：本次 save 中最后一次 content embedding 的维度。
   * 仅供宿主调试展示（patch-0 §5.4），不属于业务契约。
   */
  embeddingVectorLength?: number;
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
