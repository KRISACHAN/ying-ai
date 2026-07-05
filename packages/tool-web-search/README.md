# @ying-companion/tool-web-search

Provider-neutral web search tool package for V1.2.

The package owns:

- `WebSearchProvider` DTOs and normalized `WebSearchResult`;
- `createWebSearchTool()`, which exposes the `web_search` tool through the existing ai-core Tool contract;
- `evaluateSearchQuality()` and shared input normalization helpers.

The tool schema is **query-only**. Concrete search backends live in separate adapter packages (for example `@ying-companion/tool-web-search-tavily`).

The package does not read environment variables. Hosts must decide availability, construct a `WebSearchProvider`, and register the returned tool only when the model supports tool calling.
