import { containsCjk } from "@ying-ai/tool-web-search";

import { getDefaultStartDate } from "./tavily-search-defaults";
import type { TavilySearchTopic } from "./tavily-types";

const FINANCE_PATTERN =
  /\b(stock|stocks|etf|crypto|forex|nasdaq|nyse|s&p|dow jones|market cap|share price)\b|股价|汇率|基金|股市|证券|比特币|以太坊|财报|市值/i;

const BREAKING_NEWS_PATTERN =
  /\b(breaking news|headline news)\b|今日头条|突发新闻|突发\s*新闻|今日要闻/i;

export interface ResolvedSearchAttempt {
  topic: TavilySearchTopic;
  startDate?: string;
  country?: string;
  searchDepth: "basic";
  autoParameters: boolean;
  reason: string;
}

export function resolvePrimarySearchStrategy(
  query: string,
  now = new Date(),
): ResolvedSearchAttempt {
  const trimmed = query.trim();

  if (BREAKING_NEWS_PATTERN.test(trimmed)) {
    return createAttempt({
      topic: "news",
      now,
      reason: "breaking_news_keywords",
    });
  }

  if (FINANCE_PATTERN.test(trimmed)) {
    return createAttempt({
      topic: "finance",
      now,
      reason: "finance_keywords",
    });
  }

  if (containsCjk(trimmed)) {
    return createAttempt({
      topic: "general",
      country: "china",
      autoParameters: false,
      now,
      reason: "cjk_general_china",
    });
  }

  return createAttempt({
    topic: "general",
    now,
    reason: "default_general",
  });
}

export function resolveFallbackSearchStrategy(
  query: string,
  primary: ResolvedSearchAttempt,
): ResolvedSearchAttempt | null {
  const trimmed = query.trim();
  const country = containsCjk(trimmed) ? "china" : undefined;
  const fallback = createAttempt({
    topic: "general",
    omitStartDate: true,
    ...(country !== undefined ? { country } : {}),
    reason: "quality_fallback_general",
  });

  if (isEquivalentAttempt(primary, fallback)) {
    return null;
  }

  return fallback;
}

function createAttempt(input: {
  topic: TavilySearchTopic;
  startDate?: string;
  omitStartDate?: boolean;
  country?: string;
  autoParameters?: boolean;
  now?: Date;
  reason: string;
}): ResolvedSearchAttempt {
  const startDate = input.omitStartDate
    ? undefined
    : (input.startDate ?? getDefaultStartDate(input.now));

  return {
    topic: input.topic,
    searchDepth: "basic",
    autoParameters: input.autoParameters ?? true,
    reason: input.reason,
    ...(startDate !== undefined ? { startDate } : {}),
    ...(input.country !== undefined ? { country: input.country } : {}),
  };
}

function isEquivalentAttempt(left: ResolvedSearchAttempt, right: ResolvedSearchAttempt): boolean {
  return (
    left.topic === right.topic &&
    left.startDate === right.startDate &&
    left.country === right.country &&
    left.searchDepth === right.searchDepth &&
    left.autoParameters === right.autoParameters
  );
}
