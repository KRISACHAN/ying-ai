# @ying-ai/tool-web-search-tavily

**English** | [简体中文](./README.zh-CN.md)

Tavily adapter for `@ying-ai/tool-web-search`.

This package is a server-side adapter. It does not read environment variables and does not depend on the demo app.

## Quick start

```ts
import { createWebSearchTool } from "@ying-ai/tool-web-search";
import { TavilyWebSearchProvider } from "@ying-ai/tool-web-search-tavily";

const provider = new TavilyWebSearchProvider({ apiKey: process.env.TAVILY_API_KEY! });
const tool = createWebSearchTool({ provider });
```

## API

- **`TavilyWebSearchProvider`** — implements `WebSearchProvider` with Tavily Search API, retrieval strategy, and quality fallback
- **`TavilyWebSearchError`** — Tavily-specific error mapped to `WebSearchProviderError`

## Retrieval fallback

When `evaluateSearchQuality()` marks the primary response as `poor`, the provider issues one fallback Tavily request (max 2 calls per search). The returned `sources` come from the fallback attempt only; primary sources are not merged. Usage and response time are summed across both attempts.

## Verification

```bash
pnpm --filter @ying-ai/tool-web-search-tavily test
pnpm --filter @ying-ai/tool-web-search-tavily verify:web-search-contract
```

The contract script loads `apps/model-runtime-demo/.env` and requires a real `TAVILY_API_KEY`.
