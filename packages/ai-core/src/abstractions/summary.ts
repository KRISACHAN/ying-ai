import type { ChatMessage } from "./model";
import type { CoreProvider } from "./provider";
import type { MemoryScope } from "./memory";

export interface SummaryScope extends MemoryScope {
  conversationId?: string;
}

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

export interface SummaryOptions {
  enabled?: boolean;
  recentMessageLimit?: number;
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

export interface SummaryUpdater extends CoreProvider {
  update(input: SummaryUpdateInput): Promise<SummaryUpdateResult>;
}

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
