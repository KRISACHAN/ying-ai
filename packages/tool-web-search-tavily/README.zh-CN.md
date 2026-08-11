# @ying-ai/tool-web-search-tavily

**[English](./README.md)** | 简体中文

`@ying-ai/tool-web-search` 的 Tavily 适配器。

本包是服务端适配器：不读取环境变量，也不依赖 demo 应用。

## 快速开始

```ts
import { createWebSearchTool } from "@ying-ai/tool-web-search";
import { TavilyWebSearchProvider } from "@ying-ai/tool-web-search-tavily";

const provider = new TavilyWebSearchProvider({ apiKey: process.env.TAVILY_API_KEY! });
const tool = createWebSearchTool({ provider });
```

## API

- **`TavilyWebSearchProvider`** — 实现 `WebSearchProvider`，对接 Tavily Search API、检索策略与质量回退
- **`TavilyWebSearchError`** — Tavily 专用错误，映射为 `WebSearchProviderError`

## 检索回退

当 `evaluateSearchQuality()` 将主响应标为 `poor` 时，provider 会再发一次 Tavily 请求（每次搜索最多 2 次调用）。返回的 `sources` 仅来自回退尝试，不会与主结果合并。用量与响应时间在两次尝试间累加。

## 验证

```bash
pnpm --filter @ying-ai/tool-web-search-tavily test
pnpm --filter @ying-ai/tool-web-search-tavily verify:web-search-contract
```

契约脚本会加载 `apps/model-runtime-demo/.env`，并需要真实的 `TAVILY_API_KEY`。
