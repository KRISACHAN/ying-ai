import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateSearchQuality } from "@ying-ai/tool-web-search";
import { scoreUpcomingEventRelevance } from "../dist/extract-event-dates.js";
import { normalizeRetrievalQuery } from "../dist/normalize-retrieval-query.js";
import {
  resolveFallbackSearchStrategy,
  resolvePrimarySearchStrategy,
} from "../dist/search-strategy.js";

const FIXED_NOW = new Date("2026-07-05T00:00:00Z");

describe("resolvePrimarySearchStrategy", () => {
  it("uses general + china + current-year start_date for Chinese queries", () => {
    const strategy = resolvePrimarySearchStrategy("范玮琪 最新 演唱会 时间", FIXED_NOW);

    assert.equal(strategy.topic, "general");
    assert.equal(strategy.country, "china");
    assert.equal(strategy.searchDepth, "basic");
    assert.equal(strategy.autoParameters, false);
    assert.equal(strategy.startDate, "2026-01-01");
    assert.equal(strategy.reason, "cjk_general_china");
  });

  it("uses finance with current-year start_date", () => {
    const strategy = resolvePrimarySearchStrategy("Apple stock price today", FIXED_NOW);

    assert.equal(strategy.topic, "finance");
    assert.equal(strategy.reason, "finance_keywords");
    assert.equal(strategy.startDate, "2026-01-01");
  });

  it("uses news with current-year start_date", () => {
    const strategy = resolvePrimarySearchStrategy("breaking news in New York", FIXED_NOW);

    assert.equal(strategy.topic, "news");
    assert.equal(strategy.reason, "breaking_news_keywords");
    assert.equal(strategy.startDate, "2026-01-01");
  });

  it("defaults to general with current-year start_date for English queries", () => {
    const strategy = resolvePrimarySearchStrategy("OpenAI latest announcements", FIXED_NOW);

    assert.equal(strategy.topic, "general");
    assert.equal(strategy.reason, "default_general");
    assert.equal(strategy.startDate, "2026-01-01");
  });
});

describe("resolveFallbackSearchStrategy", () => {
  it("returns general fallback without start_date for news primary strategies", () => {
    const primary = resolvePrimarySearchStrategy("breaking news in New York", FIXED_NOW);
    const fallback = resolveFallbackSearchStrategy("breaking news in New York", primary);

    assert.notEqual(fallback, null);
    assert.equal(fallback.topic, "general");
    assert.equal(fallback.startDate, undefined);
    assert.equal(fallback.reason, "quality_fallback_general");
  });

  it("returns auto_parameters fallback when primary disables auto_parameters", () => {
    const primary = resolvePrimarySearchStrategy("范玮琪 最新 演唱会 时间", FIXED_NOW);
    const fallback = resolveFallbackSearchStrategy("范玮琪 最新 演唱会 时间", primary);

    assert.notEqual(fallback, null);
    assert.equal(fallback.topic, "general");
    assert.equal(fallback.country, "china");
    assert.equal(fallback.autoParameters, true);
    assert.equal(fallback.startDate, undefined);
    assert.equal(fallback.reason, "quality_fallback_general");
  });
});

describe("normalizeRetrievalQuery", () => {
  it("strips outdated years from planner queries", () => {
    const normalized = normalizeRetrievalQuery(
      "张韶涵 最新演唱会 时间 2023",
      new Date("2026-07-05T00:00:00Z"),
    );

    assert.equal(normalized, "张韶涵 最新演唱会 时间");
  });

  it("keeps the current year when present", () => {
    const normalized = normalizeRetrievalQuery(
      "张韶涵 最新演唱会 2026",
      new Date("2026-07-05T00:00:00Z"),
    );

    assert.equal(normalized, "张韶涵 最新演唱会 2026");
  });
});

describe("scoreUpcomingEventRelevance", () => {
  const now = new Date("2026-07-05T00:00:00Z");

  it("ranks upcoming July dates above past May dates in the same year", () => {
    const july = scoreUpcomingEventRelevance("2026张韶涵演唱会 2026.07.27 北京", now);
    const may = scoreUpcomingEventRelevance("首站嘉兴站将于2026年5月29日举行", now);

    assert.ok(july > may);
  });

  it("demotes postponed dates and prefers ticket listings", () => {
    const postponed = scoreUpcomingEventRelevance(
      "长春站原计划于7月25日举办（2026年6月宣布延期）",
      now,
    );
    const ticket = scoreUpcomingEventRelevance("时间：2026.07.27 周一20:30 场馆：北京", now);

    assert.ok(ticket > postponed);
  });
});

describe("evaluateSearchQuality", () => {
  it("marks empty results as poor", () => {
    assert.equal(
      evaluateSearchQuality("范玮琪 演唱会", {
        provider: "tavily",
        query: "test",
        sources: [],
      }),
      "poor",
    );
  });

  it("marks low-score results as poor", () => {
    assert.equal(
      evaluateSearchQuality("范玮琪 演唱会", {
        provider: "tavily",
        query: "test",
        sources: [
          {
            id: "url-1",
            title: "Irrelevant headline",
            url: "https://example.com/1",
            snippet: "Unrelated content",
            score: 0.05,
          },
        ],
      }),
      "poor",
    );
  });

  it("marks CJK queries with only English top sources as poor", () => {
    assert.equal(
      evaluateSearchQuality("范玮琪 演唱会", {
        provider: "tavily",
        query: "test",
        sources: [
          {
            id: "url-1",
            title: "UK banks back new sovereign AI project",
            url: "https://example.com/1",
            snippet: "English only content",
            score: 0.8,
          },
          {
            id: "url-2",
            title: "Another English headline",
            url: "https://example.com/2",
            snippet: "Still unrelated",
            score: 0.7,
          },
        ],
      }),
      "poor",
    );
  });

  it("marks relevant CJK results as good", () => {
    assert.equal(
      evaluateSearchQuality("范玮琪 演唱会", {
        provider: "tavily",
        query: "test",
        sources: [
          {
            id: "url-1",
            title: "范玮琪演唱会现场",
            url: "https://example.com/1",
            snippet: "演唱会信息",
            score: 0.8,
          },
        ],
      }),
      "good",
    );
  });
});
