import type { ChatMessage } from "../../abstractions/model";

export interface SummaryHistoryOptions {
  recentMessageLimit: number;
  summarizeTriggerMessageCount: number;
}

export interface SummaryHistorySplit {
  recentHistory: ChatMessage[];
  messagesToSummarize: ChatMessage[];
  triggered: boolean;
}

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

  return {
    recentHistory,
    messagesToSummarize: messages.slice(0, summarizeCount),
    triggered: true,
  };
}
