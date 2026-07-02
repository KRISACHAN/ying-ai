/* global console, process */
import assert from "node:assert/strict";

import {
  createWebSearchTool,
  TavilyWebSearchClient,
  WebSearchError,
  WEB_SEARCH_USAGE_INSTRUCTIONS,
} from "../dist/index.js";

async function main() {
  await verifiesToolSuccess();
  await verifiesNoResults();
  await verifiesInvalidArguments();
  await verifiesProviderErrors();
  await verifiesTavilyNormalization();
  console.log("verify:web-search-contract passed");
}

async function verifiesToolSuccess() {
  const tool = createWebSearchTool(
    {
      async search(input) {
        return {
          query: input.query,
          provider: "mock",
          sources: [
            { id: "s1", title: "One", url: "https://example.com/one", snippet: "Snippet one" },
            { id: "s2", title: "Two", url: "https://example.com/two", snippet: "Snippet two" },
            {
              id: "s3",
              title: "Three",
              url: "https://example.com/three",
              snippet: "Snippet three",
            },
          ],
        };
      },
    },
    { maxResults: 2 },
  );

  assert.equal(tool.definition.name, "web_search");
  assert.equal(tool.definition.metadata.externalContext, true);
  assert.equal(tool.definition.metadata.memoryPolicy, "exclude-external-facts");

  const result = await tool.handler({
    call: { id: "call-1", name: "web_search", arguments: { query: "latest ai news" } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.metadata.domain, "web_search");
  assert.equal(result.metadata.code, "OK");
  assert.equal(result.metadata.externalContext, true);
  assert.equal(result.metadata.memoryPolicy, "exclude-external-facts");
  assert.equal(result.result.sourceCount, 2);
  assert.equal(result.result.usageInstructions, WEB_SEARCH_USAGE_INSTRUCTIONS);
}

async function verifiesNoResults() {
  const tool = createWebSearchTool({
    async search(input) {
      return { query: input.query, provider: "mock", sources: [] };
    },
  });

  const result = await tool.handler({
    call: { name: "web_search", arguments: { query: "nothing" } },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "TOOL_EXECUTION_FAILED");
  assert.equal(result.metadata.code, "WEB_SEARCH_NO_RESULTS");
}

async function verifiesInvalidArguments() {
  const tool = createWebSearchTool({
    async search() {
      throw new Error("should not be called");
    },
  });

  const result = await tool.handler({
    call: { name: "web_search", arguments: { query: "x", topic: "bad" } },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "TOOL_INVALID_ARGUMENTS");
  assert.equal(result.metadata.code, "WEB_SEARCH_INVALID_QUERY");
}

async function verifiesProviderErrors() {
  for (const code of [
    "WEB_SEARCH_TIMEOUT",
    "WEB_SEARCH_RATE_LIMITED",
    "WEB_SEARCH_UNAUTHORIZED",
    "WEB_SEARCH_PROVIDER_ERROR",
  ]) {
    const tool = createWebSearchTool({
      async search() {
        throw new WebSearchError(code, `mapped ${code}`);
      },
    });
    const result = await tool.handler({
      call: { name: "web_search", arguments: { query: "valid query" } },
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "TOOL_EXECUTION_FAILED");
    assert.equal(result.metadata.code, code);
    assert.ok(!String(result.error.message).includes("stack"));
  }
}

async function verifiesTavilyNormalization() {
  const fetchCalls = [];
  const client = new TavilyWebSearchClient({
    apiKey: "test-key",
    timeoutMs: 1000,
    maxResults: 5,
    retryCount: 0,
    fetch: async (url, init) => {
      fetchCalls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            query: "query",
            answer: "must not be exposed",
            results: [
              {
                title: "Valid",
                url: "https://example.com/a#frag",
                content: "Useful snippet",
                score: 0.9,
              },
              { title: "Invalid URL", url: "javascript:alert(1)", content: "bad" },
              { title: "", url: "https://example.com/empty", content: "bad" },
              { title: "Duplicate", url: "https://example.com/a", content: "duplicate" },
              {
                title: "Second",
                url: "http://example.org/b",
                content: "Second snippet",
                published_date: "2026-07-02",
              },
            ],
          };
        },
      };
    },
  });

  const response = await client.search({ query: "query", topic: "news", timeRange: "week" });

  assert.equal(fetchCalls.length, 1);
  assert.equal(response.provider, "tavily");
  assert.equal(response.sources.length, 2);
  assert.equal(response.sources[0].url, "https://example.com/a");
  assert.equal(response.sources[1].publishedAt, "2026-07-02");
  assert.equal(response.metadata.sourceCount, 2);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
