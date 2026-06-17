/**
 * 滚动会话摘要抽象。
 *
 * 长对话超阈值时，旧消息压缩为 ConversationSummary，Prompt 只保留 summary + recent history。
 * SummaryProvider 负责 load/save；SummaryUpdater 负责用模型生成/更新摘要内容。
 */
import type { ChatMessage } from "./model";
import type { CoreProvider } from "./provider";
import type { MemoryScope } from "./memory";

/** 摘要作用域，在 MemoryScope 基础上增加 conversationId。 */
export interface SummaryScope extends MemoryScope {
  conversationId?: string;
}

/** 滚动会话摘要实体。 */
export interface ConversationSummary {
  id?: string;
  scope: SummaryScope;
  content: string;
  messageCount?: number;
  messageRange?: {
    fromMessageId?: string;
    toMessageId?: string;
  };
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

/** 宿主传入的摘要行为配置。 */
export interface SummaryOptions {
  enabled?: boolean;
  /** Prompt 中保留的近期消息条数。 */
  recentMessageLimit?: number;
  /** 总消息数超过此值时触发摘要压缩。 */
  summarizeTriggerMessageCount?: number;
}

export interface SummaryLoadInput {
  scope: SummaryScope;
}

export interface SummaryLoadResult {
  summary?: ConversationSummary | null;
}

export interface SummarySaveInput {
  scope: SummaryScope;
  summary: ConversationSummary;
}

export interface SummarySaveResult {
  summary: ConversationSummary;
}

/** 摘要持久化契约：load 读取、save 写入 ConversationSummary。 */
export interface SummaryProvider extends CoreProvider {
  load(input: SummaryLoadInput): Promise<SummaryLoadResult>;
  save(input: SummarySaveInput): Promise<SummarySaveResult>;
}

export interface SummaryUpdateInput {
  scope: SummaryScope;
  currentSummary?: ConversationSummary | null;
  messagesToSummarize: ChatMessage[];
}

export interface SummaryUpdateResult {
  summary: ConversationSummary;
  summarizedMessageCount: number;
  skipped: boolean;
  reason?: string;
}

/** 摘要内容生成契约：将旧消息片段合并进当前摘要。 */
export interface SummaryUpdater extends CoreProvider {
  update(input: SummaryUpdateInput): Promise<SummaryUpdateResult>;
}

/** 解析摘要作用域：summaryScope > scope > sessionId；均未提供时返回 undefined（摘要功能不启用）。 */
export function resolveSummaryScope(input: {
  summaryScope?: SummaryScope;
  scope?: MemoryScope;
  sessionId?: string;
  conversationId?: string;
}): SummaryScope | undefined {
  if (input.summaryScope !== undefined) {
    return input.summaryScope;
  }

  if (input.scope !== undefined) {
    return {
      ...input.scope,
      ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
    };
  }

  if (input.sessionId !== undefined && input.sessionId.trim() !== "") {
    return {
      ownerType: "session",
      ownerId: input.sessionId,
      ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
    };
  }

  return undefined;
}
