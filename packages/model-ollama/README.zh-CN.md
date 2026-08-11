# @ying-ai/model-ollama

**[English](./README.md)** | 简体中文

面向 `@ying-ai/ai-core` 的 Ollama `ChatModel` 适配器。V1.1 仅提供聊天 — **不含** Ollama embedding provider。

本包是服务端适配器：不读取环境变量、不依赖 demo 应用，也不实现 embeddings、memory、workflow、HTTP 路由、NDJSON 或浏览器侧 Ollama 访问。

## 前置条件

- 本地运行 [Ollama](https://ollama.com/)（默认 `http://127.0.0.1:11434`）
- 已拉取目标模型，例如 `ollama pull qwen3:8b`

## 快速开始

```ts
import { createOllamaChatModel } from "@ying-ai/model-ollama";
import { createCompanionCore } from "@ying-ai/ai-core";

const model = createOllamaChatModel({
  model: "qwen3:8b",
  host: "http://127.0.0.1:11434",
  keepAlive: "5m",
});

const core = createCompanionCore({ model });
for await (const event of core.streamWorkflow({ message: "你好" })) {
  // ChatWorkflowStreamEvent — 在宿主应用中映射为 Wire
}
```

## API

- **`createOllamaChatModel(config)`** — 返回实现 `ChatModel` 的 `OllamaChatModel`
- **`OllamaChatModel`** — `generate()`、`stream()`、`primaryProfile`，可选 `fallbackProfile`

配置字段（由宿主显式传入；**本包不读 env**）：

| 字段            | 默认值                       | 说明                   |
| --------------- | ---------------------------- | ---------------------- |
| `model`         | 必填                         | Ollama 模型名          |
| `host`          | `http://127.0.0.1:11434`     | Ollama API 基址        |
| `keepAlive`     | 可选                         | 传给 Ollama chat API   |
| `maxRetries`    | `0`                          | 主模型重试次数         |
| `retryDelayMs`  | `300`                        | 重试间隔（毫秒）       |
| `fallbackModel` | 可选                         | 主模型失败时的备用模型 |
| `modelProfile`  | 可选 `Partial<ModelProfile>` | 覆盖声明的能力画像     |

## 能力

默认画像（偏保守）：

```txt
streaming: true
toolCalling: false
usage: false
```

Tool calling 与 usage 取决于**具体本地模型**，而不是 provider 名称。仅在本地验证后再覆盖：

```ts
createOllamaChatModel({
  model: "my-tool-model",
  modelProfile: {
    capabilities: { streaming: true, toolCalling: true, usage: false },
  },
});
```

Workflow 依据 `ModelProfile.capabilities` 分支，**从不**依据 `provider === "ollama"`。

## 结构化输出

`OllamaChatModel.generate()` 支持 Core 的 `GenerateInput.structuredOutput`（对象输出）。适配器将其映射为 Ollama chat 的 `format: "json"`，再用 `ai-core` 提供的 schema 校验解析后的 JSON。部分本地模型仍会把 JSON mode 输出包在完整的 `json` Markdown fence 中；适配器接受这一层包装，然后执行相同的 JSON 解析与 schema 校验。它**不会**修复截断或其他无效 JSON。

这供 `ModelMemoryExtractor` 使用，使 Ollama chat 模型能通过与 OpenAI-compatible 模型相同的 Core workflow 写入长期记忆。适配器**不**实现记忆存储或 embeddings，只返回 Core 请求的结构化对象。

## 限制（V1.1）

- 无 Ollama **embedding** provider — 长期记忆 embedding 仍由宿主注入的 `EmbeddingProvider` 负责（例如经 `memory-postgres` 使用 OpenAI）
- 本包不含 HTTP / NDJSON / demo UI
- Fallback 语义：若配置了 fallback 且主模型失败，runtime 反映实际使用的模型；能力跳过可通过 `ModelRuntimeInfo` 观察

## 验证

```bash
pnpm --filter @ying-ai/model-ollama verify:adapter
```

## 相关

- Core 流式：[packages/ai-core/README.zh-CN.md](../ai-core/README.zh-CN.md)
- Demo 中的 Ollama 切换：[apps/model-runtime-demo/README.zh-CN.md](../../apps/model-runtime-demo/README.zh-CN.md)
- 阶段规格：[`.requirements/companion/stages/v1.1/stage-06/06-ollama-model-adapter.md`](../../.requirements/companion/stages/v1.1/stage-06/06-ollama-model-adapter.md)
