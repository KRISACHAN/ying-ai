# @ying-companion/model-ollama

Ollama ChatModel adapter for `@ying-companion/ai-core`.

This package is a server-side adapter. It does not read environment variables,
does not depend on the demo app, and does not implement embeddings, memory,
workflow, HTTP routes, or browser-side Ollama access.

```ts
import { createOllamaChatModel } from "@ying-companion/model-ollama";
import { createCompanionCore } from "@ying-companion/ai-core";

const model = createOllamaChatModel({
  model: "qwen3:8b",
  host: "http://127.0.0.1:11434",
});

const core = createCompanionCore({ model });
```

## Defaults

- `host`: `http://127.0.0.1:11434`
- `maxRetries`: `0`
- `retryDelayMs`: `300`
- capabilities: `{ streaming: true, toolCalling: false, usage: false }`

Tool calling is disabled by default because support belongs to a concrete local
model, not to the Ollama provider as a whole. Enable it only with a profile
override for a model you have verified locally.
