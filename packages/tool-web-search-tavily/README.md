# @ying-companion/tool-web-search-tavily

Tavily adapter for `@ying-companion/tool-web-search`.

This package is a server-side adapter. It does not read environment variables and does not depend on the demo app.

## Quick start

```ts
import { createWebSearchTool } from "@ying-companion/tool-web-search";
import { TavilyWebSearchProvider } from "@ying-companion/tool-web-search-tavily";

const provider = new TavilyWebSearchProvider({ apiKey: process.env.TAVILY_API_KEY! });
const tool = createWebSearchTool({ provider });
```

## API

- **`TavilyWebSearchProvider`** — implements `WebSearchProvider` with Tavily Search API, retrieval strategy, and quality fallback
- **`TavilyWebSearchError`** — Tavily-specific error mapped to `WebSearchProviderError`

## Verification

```bash
pnpm --filter @ying-companion/tool-web-search-tavily test
pnpm --filter @ying-companion/tool-web-search-tavily verify:web-search-contract
```

The contract script loads `apps/model-runtime-demo/.env` and requires a real `TAVILY_API_KEY`.
