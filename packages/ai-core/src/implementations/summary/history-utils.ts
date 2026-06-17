/**
 * 滚动摘要相关的 history 切分工具。
 *
 * splitForSummary：消息数超阈值时，将旧消息划入 messagesToSummarize，近期消息保留为 recentHistory。
 * trimRecentHistory：按 recentMessageLimit 截取尾部消息。
 */
import type { ChatMessage } from "../../abstractions/model";

export interface SummaryHistoryOptions {
  recentMessageLimit: number;
  summarizeTriggerMessageCount: number;
}

export interface SummaryHistorySplit {
  recentHistory: ChatMessage[];
  messagesToSummarize: ChatMessage[];
  /** 是否已触发摘要压缩（消息总数超过阈值）。 */
  triggered: boolean;
}

/** 按 recentMessageLimit 保留 history 尾部消息。 */
export function trimRecentHistory(
  history: ChatMessage[],
  options: Pick<SummaryHistoryOptions, "recentMessageLimit">,
): ChatMessage[] {
  const limit = Math.max(0, options.recentMessageLimit);

  if (limit === 0) {
    return [];
  }

  return history.slice(-limit);
}

/** 将消息列表切分为「待压缩旧消息」与「保留近期消息」。 */
export function splitForSummary(
  messages: ChatMessage[],
  options: SummaryHistoryOptions,
): SummaryHistorySplit {
  if (messages.length <= options.summarizeTriggerMessageCount) {
    return {
      recentHistory: messages,
      messagesToSummarize: [],
      triggered: false,
    };
  }

  const recentHistory = trimRecentHistory(messages, {
    recentMessageLimit: options.recentMessageLimit,
  });
  const summarizeCount = Math.max(0, messages.length - recentHistory.length);

  if (summarizeCount === 0) {
    return {
      recentHistory: messages,
      messagesToSummarize: [],
      triggered: false,
    };
  }

  return {
    recentHistory,
    messagesToSummarize: messages.slice(0, summarizeCount),
    triggered: true,
  };
}
