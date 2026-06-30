# @ying-companion/model-ollama

Ollama `ChatModel` adapter for `@ying-companion/ai-core`. V1.1 ships chat only — **no** Ollama embedding provider.

This package is a server-side adapter. It does not read environment variables, does not depend on the demo app, and does not implement embeddings, memory, workflow, HTTP routes, NDJSON, or browser-side Ollama access.

## Prerequisites

- [Ollama](https://ollama.com/) running locally (default `http://127.0.0.1:11434`)
- Target model pulled, e.g. `ollama pull qwen3:8b`

## Quick start

```ts
import { createOllamaChatModel } from "@ying-companion/model-ollama";
import { createCompanionCore } from "@ying-companion/ai-core";

const model = createOllamaChatModel({
  model: "qwen3:8b",
  host: "http://127.0.0.1:11434",
  keepAlive: "5m",
});

const core = createCompanionCore({ model });
for await (const event of core.streamWorkflow({ message: "你好" })) {
  // ChatWorkflowStreamEvent — map to Wire in the host app
}
```

## API

- **`createOllamaChatModel(config)`** — returns `OllamaChatModel` implementing `ChatModel`
- **`OllamaChatModel`** — `generate()`, `stream()`, `primaryProfile`, optional `fallbackProfile`

Config fields (host passes explicitly; **no env reads in this package**):

| Field           | Default                          | Description                        |
| --------------- | -------------------------------- | ---------------------------------- |
| `model`         | required                         | Ollama model name                  |
| `host`          | `http://127.0.0.1:11434`         | Ollama API base URL                |
| `keepAlive`     | optional                         | Passed to Ollama chat API          |
| `maxRetries`    | `0`                              | Primary model retries              |
| `retryDelayMs`  | `300`                            | Delay between retries              |
| `fallbackModel` | optional                         | Secondary model on primary failure |
| `modelProfile`  | optional `Partial<ModelProfile>` | Override declared capabilities     |

## Capabilities

Default profile (conservative):

```txt
streaming: true
toolCalling: false
usage: false
```

Tool calling and usage depend on the **concrete local model**, not the provider name. Override only after verifying locally:

```ts
createOllamaChatModel({
  model: "my-tool-model",
  modelProfile: {
    capabilities: { streaming: true, toolCalling: true, usage: false },
  },
});
```

Workflow branches on `ModelProfile.capabilities`, never on `provider === "ollama"`.

## Structured output

`OllamaChatModel.generate()` supports Core `GenerateInput.structuredOutput` for object output.
The adapter maps it to Ollama chat `format: "json"` and then validates the parsed JSON with the
schema supplied by `ai-core`.

This is used by `ModelMemoryExtractor`, so Ollama chat models can write long-term memories through
the same Core workflow as OpenAI-compatible models. The adapter does **not** implement memory
storage or embeddings; it only returns the structured object requested by Core.

## Limits (V1.1)

- No Ollama **embedding** provider — long-term memory embedding stays with host-injected `EmbeddingProvider` (e.g. OpenAI via `memory-postgres`)
- No HTTP / NDJSON / demo UI in this package
- Fallback semantics: if fallback is configured and primary fails, runtime reflects actual model used; capability skips are observable via `ModelRuntimeInfo`

## Verification

```bash
pnpm --filter @ying-companion/model-ollama verify:adapter
```

## Related

- Core streaming: [`packages/ai-core/README.md`](../ai-core/README.md)
- Demo Ollama switch: [`apps/model-runtime-demo/README.md`](../../apps/model-runtime-demo/README.md)
- Stage spec: [`.requirements/stages/v1.1/stage-06/06-ollama-model-adapter.md`](../../.requirements/stages/v1.1/stage-06/06-ollama-model-adapter.md)
