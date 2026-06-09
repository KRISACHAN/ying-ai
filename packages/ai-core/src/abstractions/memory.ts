import type { CoreProvider } from "./provider";

export type MemoryType = "fact" | "preference" | "event" | "relationship";

export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  importance?: number;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MemoryRecallInput {
  sessionId?: string;
  message: string;
  topK?: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySaveInput {
  sessionId?: string;
  memories: Memory[];
  metadata?: Record<string, unknown>;
}

export interface MemoryProvider extends CoreProvider {
  recall(input: MemoryRecallInput): Promise<Memory[]>;
  save(input: MemorySaveInput): Promise<void>;
}
