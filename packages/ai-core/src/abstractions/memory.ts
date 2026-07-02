/**
 * 长期记忆抽象（阶段 4）。
 *
 * - MemoryProvider：向量/关键词 recall + 持久化 save
 * - MemoryExtractor：从本轮对话抽取结构化记忆（与存储解耦）
 * - EmbeddingProvider：文本向量化（具体实现可在 memory-postgres 或宿主侧）
 *
 * MemoryScope 用于隔离不同用户 / 会话 / 伴侣的记忆，避免互相污染。
 */
import type { CoreProvider } from "./provider";
import type { ChatMessage } from "./model";

/** 长期记忆分类：事实 / 偏好 / 关系 / 事件。 */
export type MemoryType = "fact" | "preference" | "relationship" | "event";

/** 重要度 1（最低）到 5（最高）；默认 recall/save 阈值为 3。 */
export type MemoryImportance = 1 | 2 | 3 | 4 | 5;

/** 记忆隔离边界：不同 owner / companion 的记忆互不召回。 */
export interface MemoryScope {
  ownerType: "anonymous" | "user" | "session" | "custom";
  ownerId: string;
  companionId?: string;
}

/** 记忆写入来源，便于追溯是哪轮对话产生的。 */
export interface MemorySource {
  conversationId?: string;
  messageIds?: string[];
  reason?: string;
}

/** 已持久化的记忆记录。 */
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

/** MemoryRecord 别名，语义上强调「已存储」状态。 */
export type Memory = MemoryRecord;

/** 抽取器输出、尚未写入存储的结构化记忆。 */
export interface ExtractedMemory {
  type: MemoryType;
  content: string;
  importance: MemoryImportance;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/** recall 输入：按 scope 隔离，用 query 做语义检索。 */
export interface MemoryRecallInput {
  scope: MemoryScope;
  query: string;
  limit?: number;
  minImportance?: MemoryImportance;
  metadata?: Record<string, unknown>;
}

/** 召回结果，可附带向量相似度 score。 */
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

/** save 输入：批量写入 ExtractedMemory，带来源信息。 */
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

/** 记忆抽取输入：本轮 user/assistant 消息 + 可选短期 history。 */
export interface MemoryExtractionInput {
  scope: MemoryScope;
  userMessage: string;
  assistantMessage: string;
  history?: ChatMessage[];
  externalContextUsed?: boolean;
  excludedToolNames?: string[];
}

export interface MemoryExtractionResult {
  memories: ExtractedMemory[];
}

/** 长期记忆的存储与召回契约。 */
export interface MemoryProvider extends CoreProvider {
  recall(input: MemoryRecallInput): Promise<MemoryRecallResult>;
  save(input: MemorySaveInput): Promise<MemorySaveResult>;
}

/** 从对话中抽取结构化记忆，与 MemoryProvider 解耦。 */
export interface MemoryExtractor extends CoreProvider {
  extract(input: MemoryExtractionInput): Promise<MemoryExtractionResult>;
}

/** 文本向量化输入。 */
export interface EmbedInput {
  text: string;
}

export interface EmbedResult {
  vector: number[];
  model?: string;
}

/** 文本向量化契约；具体实现可在 memory-postgres 或宿主侧。 */
export interface EmbeddingProvider extends CoreProvider {
  embed(input: EmbedInput): Promise<EmbedResult>;
}

/** 从 ChatWorkflowInput 解析记忆作用域：显式 scope 优先，否则回退到 sessionId。 */
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
