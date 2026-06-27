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
