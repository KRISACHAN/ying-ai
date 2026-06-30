# Model Provider Strategy

V1.1 的模型选择边界：

- `ai-core` 只定义 `ChatModel`、`ModelProfile`、`requiredCapabilities` 与错误语义；
- 具体 Adapter 负责把第三方 SDK 调用映射到 `ChatModel`，并按本次调用能力筛选 primary / fallback；
- 宿主负责读取环境变量、注册 provider strategy、创建 Adapter、展示脱敏后的 effective profile；
- Workflow 不得根据 provider 名称或 `meta.id` 判断能力，只能读取 `ModelProfile.capabilities`。

## Model Profile

`ModelProfile` 由 `provider + model + capabilities` 组成。`provider` 与 `model` 必须来自实际请求目标，
宿主只能用 `ModelProfileOverride.capabilities` 覆盖能力字段。

OpenAI-compatible 的保守默认值：

```txt
streaming=true
toolCalling=false
usage=false
```

工具调用与 usage 只有在具体模型和网关验证后才应显式开启。

## Capability Fallback

`GenerateInput.requiredCapabilities` 声明本次调用必须满足的能力。Adapter 必须先筛选候选：

```txt
primaryProfile
↓
满足 requiredCapabilities 才请求
↓
失败后检查 fallbackProfile
↓
fallback 不满足能力时记录 capability skip，不发请求
```

能力不足不是网络错误。它会进入 `ModelRuntimeInfo.capabilitySkips`，或通过
`ModelCapabilityUnavailableError.capabilitySkips` 暴露给宿主。

## Tool Planning

`DefaultToolPlanningProvider` 与最终回复生成分离：

- 没有工具时直接返回 `no_tool(reason=no_tools)`；
- 有工具时调用 `generate({ requiredCapabilities: { toolCalling: true } })`；
- 模型不支持工具调用时降级为 `no_tool(reason=tool_calling_unavailable)`；
- 规划器不执行工具，也不把模型规划文本作为用户可见回复。

## Stream Workflow Lifecycle (V1.1)

详细事件顺序与 Core API：[`packages/ai-core/README.md`](../../packages/ai-core/README.md) § 5.2。

```txt
Persona → Safety input → Summary load → Memory recall → Emotion
→ Tool list → Tool plan (generate) → Tool execute (generate, if any)
→ Final response (stream → text:delta)
→ Safety output (full text) → Summary save → Memory extract/save
→ workflow:finish
```

宿主消费：`core.streamWorkflow()` → map Core Event → Wire Event → NDJSON POST response.

Implementation reference: [`apps/model-runtime-demo/app/lib/chat-stream-wire.ts`](../../apps/model-runtime-demo/app/lib/chat-stream-wire.ts).

## Core Event / Wire Event / NDJSON

| Layer     | Type                           | Owner      |
| --------- | ------------------------------ | ---------- |
| Core      | `ChatWorkflowStreamEvent`      | `ai-core`  |
| Wire      | `ChatWorkflowStreamWireEvent`  | demo host  |
| Transport | POST + `ReadableStream` NDJSON | demo route |

Rules: strip `raw`, serialize dates as ISO strings, map `Error` to `SafeWorkflowError`. Do not duplicate full DTO definitions here — see stage-02 spec and demo wire mapper.

Verify: `pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract`

## Ollama Local Development

See [`packages/model-ollama/README.md`](../../packages/model-ollama/README.md). Chat provider and embedding provider are independent.

## Debug Workbench Observability

See [`apps/model-runtime-demo/README.md`](../../apps/model-runtime-demo/README.md) — Timeline, runtime, Persona preview, memory/emotion/summary panels, chat turn status.

## V1.1 Limitations

See [`.code-reviews/v1.1/conclusion.md`](../../.code-reviews/v1.1/conclusion.md) § 已知限制.
