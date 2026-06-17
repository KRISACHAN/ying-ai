# AI Companion Core V1 - 阶段 5：情绪状态机实施文档

## 文档说明

本文档用于指导实现：

```txt
.requirements/stages/stage-05/05-emotion-engine.md
```

当前项目已经完成：

```txt
阶段 1：Model Runtime
阶段 2：Core 抽象层
阶段 3：聊天主链路（最小闭环）
阶段 4：记忆系统（长期记忆 + RAG）
```

阶段 5 的目标是在已有聊天与记忆链路上接入“情绪状态机”。

这里的“情绪状态机”不是复杂剧情系统，也不是好感度系统，而是让 Core 在单轮对话中具备以下能力：

```txt
识别用户本轮情绪倾向
↓
结合上轮伴侣情绪状态
↓
计算新的伴侣情绪状态
↓
把情绪状态注入 Prompt
↓
让模型回复时体现连续情绪
↓
把新情绪状态返回给宿主保存
```

阶段 5 完成后，Core 将具备最小情绪连续性，但仍然保持纯 SDK，不读取环境变量、不连接数据库、不保存用户状态。

---

## 一、阶段目标

阶段 5 要完成的是：

```txt
情绪识别 + 情绪转移 + Prompt 注入 + 状态交接
```

具体包括：

1. 保留并完善 `EmotionEngine` 抽象；
2. 实现基于模型的情绪识别；
3. 实现确定性的情绪转移规则；
4. 将情绪状态注入 `SimpleChatWorkflow` 的 Prompt；
5. 通过 `CoreObserver` 暴露情绪分析过程；
6. 在调试 UI 中展示情绪变化；
7. 将本轮最终情绪状态返回给宿主；
8. 由宿主负责保存并在下一轮传回 `ChatWorkflowInput.emotion`；
9. 保证阶段 1～4 已完成能力不被破坏；
10. 继续保持 `ai-core` 纯 SDK 边界。

---

## 二、阶段完成标准

完成后需要满足：

1. `@ying-companion/ai-core` 可独立构建；
2. `EmotionEngine` 插槽可以被真实实现替换；
3. 默认 `DisabledEmotionEngine` 仍然可用；
4. 新增真实实现 `ModelEmotionEngine`；
5. `ModelEmotionEngine` 只通过注入的 `ChatModel` 调模型；
6. `ModelEmotionEngine` 不读取 `.env`；
7. `ModelEmotionEngine` 不直接依赖 OpenAI SDK；
8. `ModelEmotionEngine` 输出必须经过结构化校验；
9. 模型输出格式错误时不能污染主链路；
10. `SimpleChatWorkflow` 在生成前调用 `emotion.analyze` 与 `emotion.transition`；
11. 情绪结果注入 system prompt；
12. `ChatWorkflowOutput.emotion` 返回本轮最终情绪；
13. 调试 UI 可以展示：上一轮情绪、本轮检测情绪、本轮最终情绪；
14. Core 内不写死 console，所有可观测信息走 `CoreObserver`；
15. 阶段 4 的记忆 recall / extract / save 流程仍然正常。

---

## 三、阶段边界

### 3.1 本阶段要做

本阶段只做最小可用情绪状态机。

需要完成：

1. 实现 `ModelEmotionEngine`；
2. 实现情绪分析 Prompt；
3. 实现情绪分析结果 schema；
4. 实现情绪转移规则；
5. 实现情绪 prompt formatter；
6. 在 `SimpleChatWorkflow` 中接入情绪调用点；
7. 在 `ChatWorkflowDebugContext` 中补充情绪调试信息；
8. 在 demo 页面展示情绪状态；
9. 文档同步更新 `packages/ai-core/README.md` 当前阶段状态；
10. 保留未来外部持久化 Provider 的扩展空间。

### 3.2 本阶段不做

本阶段不做：

1. 不实现好感度系统；
2. 不实现亲密度等级；
3. 不实现攻略系统；
4. 不实现复杂剧情状态机；
5. 不实现多角色群聊情绪；
6. 不实现用户系统；
7. 不实现鉴权；
8. 不实现情绪数据库表；
9. 不在 `ai-core` 里保存情绪状态；
10. 不在 `memory-postgres` 里混入情绪存储；
11. 不引入 LangChain；
12. 不引入 LangGraph；
13. 不实现远程 tool call；
14. 不实现流式聊天主链路；
15. 不把情绪状态作为长期记忆自动写入数据库。

### 3.3 为什么本阶段不做情绪数据库

`ai-core` 当前的核心边界是：

```txt
纯 SDK
不读 env
不连库
不保存用户状态
```

因此阶段 5 的“情绪持久化”不应该理解为：

```txt
ai-core 自己创建 emotion_states 表并写入数据库
```

而应该理解为：

```txt
本轮输入：宿主传入 previous emotion
本轮输出：Core 返回 next emotion
宿主保存：demo / API / 未来业务层负责保存 next emotion
下一轮输入：宿主再把保存的 emotion 传回 Core
```

也就是：

```txt
ChatWorkflowInput.emotion
↓
EmotionEngine.analyze
↓
EmotionEngine.transition
↓
ChatWorkflowOutput.emotion
```

这种设计可以保证未来接用户系统时：

```txt
userId + companionId -> sessionId -> emotion state
```

由业务层决定如何映射，Core 不感知用户系统。

---

## 四、承接前置阶段的硬性约束

阶段 5 必须继续遵守阶段 1～4 的所有边界。

### 4.1 ai-core 仍然是纯 SDK

`packages/ai-core` 可以包含：

```txt
EmotionEngine 抽象
ModelEmotionEngine 实现
情绪识别 Prompt
情绪状态转移规则
情绪 Prompt Formatter
Observer 事件
Workflow 调用点
```

`packages/ai-core` 不能包含：

```txt
数据库连接
数据库表结构
DATABASE_URL
用户系统
鉴权逻辑
console 调试输出
```

### 4.2 模型调用必须复用 ChatModel

阶段 5 不能在情绪模块里重新创建模型。

禁止：

```ts
new OpenAI(...)
createOpenAI(...)
process.env.OPENAI_API_KEY
```

必须：

```ts
new ModelEmotionEngine({ model })
```

或者由工厂/宿主显式传入已经创建好的 `ChatModel`。

### 4.3 情绪状态由宿主保存

`ChatWorkflowInput.emotion` 已经存在。

本阶段要让它真正被消费：

```ts
await core.executeWorkflow({
  sessionId: "demo-session",
  message: "我今天有点难受",
  history,
  emotion: previousEmotion,
});
```

返回：

```ts
{
  text: "...",
  emotion: nextEmotion,
}
```

demo 页面可以把 `nextEmotion` 保存在 React state 中，下一轮继续传回。

未来正式业务可以保存到数据库、Redis、KV 或其它状态存储，但不属于本阶段。

### 4.4 情绪失败不能阻断聊天主链路

情绪系统是增强能力，不是聊天主链路的硬依赖。

如果情绪分析失败，Workflow 应该降级为：

```txt
使用 previous emotion
或使用 neutral
继续生成回复
```

除非未来显式配置为 strict 模式，否则不要因为情绪分析失败导致用户无法聊天。

### 4.5 不要把情绪当长期记忆保存

本阶段不要自动把：

```txt
用户今天很难过
用户情绪焦虑
伴侣当前 affectionate
```

写入长期记忆。

原因：

1. 情绪状态是高频变化状态；
2. 长期记忆是低频稳定事实；
3. 两者生命周期不同；
4. 混在一起会污染 RAG 召回；
5. 未来可以单独设计情绪历史或关系状态表。

---

## 五、情绪模型设计

### 5.1 情绪类型

沿用当前 `EmotionType`：

```ts
export type EmotionType =
  | "neutral"
  | "happy"
  | "sad"
  | "angry"
  | "anxious"
  | "affectionate";
```

含义：

```txt
neutral      平静、普通、无明显情绪
happy        开心、轻松、愉悦
sad          难过、失落、沮丧
angry        生气、不满、烦躁
anxious      焦虑、不安、担心
affectionate 亲近、依恋、撒娇、温柔
```

### 5.2 情绪状态结构

沿用当前 `EmotionState`：

```ts
export interface EmotionState {
  current: EmotionType;
  intensity: number;
  updatedAt?: Date;
  metadata?: Record<string, unknown>;
}
```

约定：

```txt
current   当前情绪类型
intensity 情绪强度，范围 0～1
updatedAt 状态更新时间
metadata  调试信息或扩展信息，不作为稳定业务字段
```

### 5.3 intensity 约束

`intensity` 必须归一化到 `0 ~ 1`。

推荐语义：

```txt
0.0       无情绪
0.1~0.3   轻微
0.4~0.6   中等
0.7~0.9   强烈
1.0       极强
```

任何模型输出都必须经过 clamp：

```ts
Math.min(1, Math.max(0, intensity));
```

### 5.4 默认状态

当宿主未传入 `input.emotion` 时，默认状态为：

```ts
{
  current: "neutral",
  intensity: 0,
  updatedAt: new Date(),
}
```

---

## 六、EmotionEngine 设计

### 6.1 当前抽象

当前已有接口：

```ts
export interface EmotionEngine extends CoreProvider {
  analyze(input: EmotionAnalyzeInput): Promise<EmotionState>;
  transition(input: EmotionTransitionInput): Promise<EmotionState>;
}
```

本阶段优先不破坏该接口。

### 6.2 实现类

新增：

```txt
packages/ai-core/src/implementations/emotion/model-emotion-engine.ts
```

类名：

```ts
export class ModelEmotionEngine implements EmotionEngine
```

构造参数建议：

```ts
export interface ModelEmotionEngineOptions {
  model: ChatModel;
  defaultEmotion?: EmotionState;
  temperature?: number;
  maxTokens?: number;
  strict?: boolean;
}
```

说明：

```txt
model          必传，复用阶段 1 的 ChatModel
默认情绪       未传 previous 时使用
温度           建议 0 或 0.1，减少结构化输出波动
maxTokens      情绪分析输出很短，建议限制
strict         默认为 false；false 时情绪失败不阻断聊天
```

### 6.3 meta

所有 Provider 必须有稳定 meta。

```ts
readonly meta = {
  id: "model-emotion-engine",
  kind: "emotion",
  name: "Model Emotion Engine",
  description: "Analyze user emotion with ChatModel and apply deterministic transition rules.",
  version: "0.1.0",
} as const;
```

### 6.4 DisabledEmotionEngine 继续保留

默认不应自动启用真实情绪识别，避免无感增加模型调用成本。

也就是说：

```ts
createCompanionCore({ model })
```

仍然使用 `DisabledEmotionEngine`。

启用真实情绪时，由宿主显式注入：

```ts
const emotion = new ModelEmotionEngine({ model });

const core = createCompanionCore({
  model,
  emotion,
});
```

---

## 七、情绪识别设计

### 7.1 analyze 的职责

`analyze` 只负责识别“当前用户消息触发出的情绪倾向”。

输入：

```ts
{
  sessionId,
  message,
  previous,
  metadata,
}
```

输出：

```ts
{
  current: "sad",
  intensity: 0.6,
  updatedAt: new Date(),
  metadata: {
    reason: "用户表达疲惫和难受",
    confidence: 0.82,
  }
}
```

注意：

```txt
analyze 输出的是 detected emotion
不是最终 emotion
```

最终 emotion 由 `transition` 决定。

### 7.2 结构化输出 Schema

建议新增：

```txt
packages/ai-core/src/implementations/emotion/emotion.schema.ts
```

Schema 示例：

```ts
import { z } from "zod";

export const emotionAnalysisSchema = z.object({
  emotion: z.enum([
    "neutral",
    "happy",
    "sad",
    "angry",
    "anxious",
    "affectionate",
  ]),
  intensity: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().max(200).optional(),
});
```

### 7.3 模型输出要求

情绪分析 Prompt 必须要求模型只输出 JSON。

示例：

```txt
你是一个情绪识别器。
请根据用户本轮消息判断用户当前主要情绪。

只能从以下情绪中选择一个：
neutral, happy, sad, angry, anxious, affectionate

请输出 JSON：
{
  "emotion": "sad",
  "intensity": 0.6,
  "confidence": 0.8,
  "reason": "简短原因"
}

要求：
1. 不要输出 Markdown
2. 不要输出解释文字
3. intensity 必须是 0 到 1 的数字
4. reason 不超过 200 字
```

### 7.4 解析失败处理

如果模型返回格式错误：

默认行为：

```txt
返回 previous 或 neutral
不中断聊天
```

metadata 中记录：

```ts
{
  failed: true,
  reason: "schema_parse_failed",
}
```

strict 模式：

```txt
抛出错误，让 Workflow 进入 workflow:error
```

但 V1 demo 默认不要开启 strict。

---

## 八、情绪转移设计

### 8.1 transition 的职责

`transition` 负责把：

```txt
previous emotion
+
detected emotion
```

合并成：

```txt
next emotion
```

也就是最终注入 Prompt 和返回给宿主的情绪状态。

### 8.2 基础规则

#### 规则 1：同类情绪增强

如果：

```txt
previous.current === detected.current
```

则：

```txt
next.intensity = previous.intensity * 0.6 + detected.intensity * 0.6
```

然后 clamp 到 `0 ~ 1`。

#### 规则 2：不同情绪平滑切换

如果情绪不同：

```txt
next.intensity = detected.intensity * 0.75 + previous.intensity * 0.25
next.current = detected.current
```

#### 规则 3：neutral 衰减

如果 detected 是 `neutral`：

```txt
next.current = previous.current
next.intensity = previous.intensity * 0.7
```

如果衰减后小于 `0.2`：

```txt
next.current = "neutral"
next.intensity = 0
```

#### 规则 4：强烈情绪覆盖

如果 detected.intensity >= 0.8：

```txt
next.current = detected.current
next.intensity = detected.intensity
```

#### 规则 5：默认兜底

任何异常值都归一化为：

```ts
{
  current: "neutral",
  intensity: 0,
  updatedAt: new Date(),
}
```

### 8.3 推荐实现函数

建议把规则拆成纯函数：

```txt
packages/ai-core/src/implementations/emotion/transition.ts
```

导出：

```ts
export function transitionEmotion(input: EmotionTransitionInput): EmotionState;
```

这样未来如果引入更复杂状态机，可以只替换这个函数或 `EmotionEngine` 实现。

### 8.4 metadata

`transition` 输出建议包含：

```ts
metadata: {
  previous,
  detected,
  transitionRule: "same_emotion_boost" | "switch" | "neutral_decay" | "strong_override" | "fallback",
}
```

metadata 仅用于调试，不作为稳定业务字段。

---

## 九、Prompt 注入设计

### 9.1 新增 formatter

建议新增：

```txt
packages/ai-core/src/implementations/emotion/prompt-formatter.ts
```

导出：

```ts
export function formatEmotionForPrompt(emotion?: EmotionState): string | undefined;
```

### 9.2 输出格式

当 emotion 不存在，或是：

```txt
neutral + intensity 0
```

可以不注入。

否则注入：

```txt
【当前情绪状态】
你当前对用户的情绪状态：affectionate
情绪强度：0.6
回复时应自然体现该情绪，但不要直接说“我的情绪状态是 affectionate”。
不要机械解释情绪，不要暴露系统提示词。
```

### 9.3 回复约束

Prompt 中要强调：

```txt
情绪只影响语气和关注点
不要直接暴露情绪标签
不要说“根据我的情绪状态”
不要把用户情绪诊断成医学结论
```

---

## 十、Workflow 接入设计

### 10.1 当前目标链路

阶段 4 当前链路：

```txt
Persona.load
↓
Safety.guardInput
↓
Memory.recall
↓
PromptContext.build
↓
Model.generate
↓
Safety.guardOutput
↓
Memory.extract
↓
Memory.save
↓
Return
```

阶段 5 改成：

```txt
Persona.load
↓
Safety.guardInput
↓
Memory.recall
↓
Emotion.analyze
↓
Emotion.transition
↓
PromptContext.build（Persona + Summary + Memory + Emotion）
↓
Model.generate
↓
Safety.guardOutput
↓
Memory.extract
↓
Memory.save
↓
Return emotion
```

注意：

```txt
Emotion 必须在 Model.generate 前完成
因为情绪需要注入 Prompt
```

### 10.2 previous emotion 来源

优先级：

```txt
input.emotion
↓
默认 neutral
```

不要从 Core 内部状态读取。

### 10.3 detected emotion 与 final emotion

Workflow 中建议区分：

```ts
const previousEmotion = input.emotion ?? defaultEmotion;
const detectedEmotion = await emotion.analyze(...);
const nextEmotion = await emotion.transition({
  previous: previousEmotion,
  detected: detectedEmotion,
});
```

输出：

```ts
return {
  ...,
  emotion: nextEmotion,
}
```

### 10.4 情绪失败降级

伪代码：

```ts
let nextEmotion = input.emotion ?? neutralEmotion();
let detectedEmotion: EmotionState | undefined;

try {
  await observer.emit({ type: "emotion:analyze:start", ... });

  detectedEmotion = await core.emotion.analyze({
    sessionId: input.sessionId,
    message: input.message,
    previous: nextEmotion,
    metadata: input.metadata,
  });

  nextEmotion = await core.emotion.transition({
    previous: nextEmotion,
    detected: detectedEmotion,
  });

  await observer.emit({
    type: "emotion:analyze:end",
    payload: {
      previous: input.emotion,
      detected: detectedEmotion,
      next: nextEmotion,
    },
  });
} catch (error) {
  nextEmotion = input.emotion ?? neutralEmotion();

  await observer.emit({
    type: "emotion:analyze:end",
    payload: {
      failed: true,
      next: nextEmotion,
      error: safeErrorSummary(error),
    },
  });
}
```

### 10.5 是否新增 Observer 事件类型

当前 `CoreEventType` 已有：

```txt
emotion:analyze:start
emotion:analyze:end
```

本阶段可以先复用这两个事件，把 transition 结果放进 `emotion:analyze:end.payload`。

如果执行时希望更细，也可以加：

```txt
emotion:transition:start
emotion:transition:end
```

这是向后兼容的新增类型，但 V1 不是必须。

### 10.6 DebugContext 扩展

建议扩展：

```ts
export interface ChatWorkflowDebugContext {
  emotionContext?: string;
  previousEmotion?: EmotionState;
  detectedEmotion?: EmotionState;
  nextEmotion?: EmotionState;
}
```

这样 demo 可以展示本轮实际注入 Prompt 的情绪上下文。

---

## 十一、目录结构

阶段 5 建议新增或修改以下文件。

### 11.1 ai-core 新增文件

```txt
packages/ai-core/src/implementations/emotion/
  model-emotion-engine.ts
  emotion.schema.ts
  transition.ts
  prompt-formatter.ts
```

### 11.2 ai-core 修改文件

```txt
packages/ai-core/src/abstractions/workflow.ts
packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts
packages/ai-core/src/implementations/emotion/disabled-emotion-engine.ts
packages/ai-core/src/index.ts
packages/ai-core/README.md
```

### 11.3 demo 修改文件

以当前 `apps/model-runtime-demo` 实际结构为准，需要完成：

```txt
展示 previous emotion
展示 detected emotion
展示 next emotion
把 next emotion 保存到页面状态
下一轮请求时传回 emotion
```

如果当前 demo API route 已经接收 body，则需要扩展请求字段：

```ts
{
  message,
  history,
  emotion,
  scope,
  memoryOptions,
  summaryOptions,
}
```

响应中返回：

```ts
{
  text,
  emotion,
  events,
  metadata,
}
```

---

## 十二、具体实施任务

### 任务 1：确认并补齐 Emotion 抽象

#### 目标

确保当前 `EmotionEngine` 抽象足够支撑阶段 5。

#### 要做

检查：

```txt
packages/ai-core/src/abstractions/emotion.ts
```

确认已有：

```ts
EmotionType
EmotionState
EmotionAnalyzeInput
EmotionTransitionInput
EmotionEngine
```

如果需要，只做向后兼容补充，不要破坏已有字段。

#### 完成标准

1. 类型导出正常；
2. 不影响已有调用；
3. `pnpm --filter @ying-companion/ai-core build` 通过。

---

### 任务 2：实现情绪分析 Schema

#### 目标

保证模型输出结构可控。

#### 要做

新增：

```txt
packages/ai-core/src/implementations/emotion/emotion.schema.ts
```

内容包括：

```ts
emotionAnalysisSchema
parseEmotionAnalysis
```

`parseEmotionAnalysis` 负责：

```txt
JSON parse
schema 校验
intensity clamp
默认值补齐
安全错误摘要
```

#### 完成标准

1. 非 JSON 输出不会直接污染主链路；
2. emotion 只能是允许枚举；
3. intensity 一定在 0～1；
4. 文件不读取 env，不调用模型。

---

### 任务 3：实现情绪转移规则

#### 目标

把状态机核心逻辑做成纯函数。

#### 要做

新增：

```txt
packages/ai-core/src/implementations/emotion/transition.ts
```

实现：

```ts
transitionEmotion(input: EmotionTransitionInput): EmotionState
```

必须支持：

```txt
同类增强
不同情绪切换
neutral 衰减
强烈情绪覆盖
异常兜底
```

#### 完成标准

1. 函数无副作用；
2. 不调用模型；
3. 不读取外部状态；
4. 输出一定是合法 `EmotionState`。

---

### 任务 4：实现 ModelEmotionEngine

#### 目标

通过 `ChatModel` 做真实情绪识别。

#### 要做

新增：

```txt
packages/ai-core/src/implementations/emotion/model-emotion-engine.ts
```

实现：

```ts
export class ModelEmotionEngine implements EmotionEngine
```

内部：

```txt
analyze -> model.generate -> parseEmotionAnalysis -> EmotionState
transition -> transitionEmotion
```

#### 关键约束

1. 不读取 env；
2. 不创建模型；
3. 不直接调用 OpenAI；
4. 不写 console；
5. 错误默认降级，不阻断主链路；
6. strict 模式才抛错。

#### 完成标准

宿主注入后：

```ts
const emotion = new ModelEmotionEngine({ model });
```

可以被：

```ts
createCompanionCore({ model, emotion })
```

正常消费。

---

### 任务 5：实现情绪 Prompt Formatter

#### 目标

把最终情绪状态自然注入 system prompt。

#### 要做

新增：

```txt
packages/ai-core/src/implementations/emotion/prompt-formatter.ts
```

实现：

```ts
formatEmotionForPrompt(emotion?: EmotionState): string | undefined
```

#### 完成标准

1. neutral + 0 不注入；
2. 其它情绪生成清晰 prompt 块；
3. prompt 不能暴露内部状态机细节；
4. prompt 要要求模型自然体现情绪，不要直说标签。

---

### 任务 6：接入 SimpleChatWorkflow

#### 目标

让情绪状态参与主链路。

#### 要做

修改：

```txt
packages/ai-core/src/implementations/workflow/simple-chat-workflow.ts
```

在 `Model.generate` 前加入：

```txt
Emotion.analyze
Emotion.transition
formatEmotionForPrompt
```

Prompt 拼装顺序建议：

```txt
Persona
Summary
Memory
Emotion
回复约束
```

#### 完成标准

1. `input.emotion` 被消费；
2. `result.emotion` 被返回；
3. 情绪 prompt 出现在 `metadata.debugContext.messages` 中；
4. 情绪失败时仍能返回聊天结果；
5. 阶段 4 的 memory / summary debugContext 不丢失。

---

### 任务 7：接入 Observer 事件

#### 目标

让 demo 可以看到情绪执行过程。

#### 要做

在 Workflow 中 emit：

```txt
emotion:analyze:start
emotion:analyze:end
```

payload 建议：

```ts
{
  sessionId,
  previous,
  detected,
  next,
  failed,
  error,
}
```

#### 完成标准

demo 能显示：

```txt
[Emotion Before]
[Emotion Detected]
[Emotion After]
```

不要用 console 作为 Core 内部验证方式。

---

### 任务 8：更新导出入口

#### 目标

让宿主可以使用真实情绪引擎。

#### 要做

修改：

```txt
packages/ai-core/src/index.ts
```

导出：

```ts
ModelEmotionEngine
formatEmotionForPrompt
transitionEmotion
```

是否导出 schema 视情况决定。

推荐导出纯函数，方便未来替换或调试。

#### 完成标准

宿主可写：

```ts
import { ModelEmotionEngine } from "@ying-companion/ai-core";
```

---

### 任务 9：更新 demo

#### 目标

提供人工可验证结果。

#### 要做

在 demo 中：

1. 创建 `ModelEmotionEngine`；
2. 注入 `createCompanionCore`；
3. 页面保存上一轮 `emotion`；
4. 下一轮请求时传入 `emotion`；
5. 展示 Observer 事件；
6. 展示最终 `result.emotion`；
7. 展示 debugContext 中的 emotion prompt。

#### 完成标准

在调试 UI 中连续输入：

```txt
我今天很开心
我突然有点担心明天的事情
没事了，现在好多了
```

页面能看到情绪从：

```txt
happy
↓
anxious
↓
逐渐衰减或回到 neutral
```

---

### 任务 10：更新文档

#### 目标

保持仓库文档与当前实现一致。

#### 要做

更新：

```txt
packages/ai-core/README.md
```

至少修改：

```txt
阶段 5：情绪状态机 ✅
```

并补充：

```txt
ModelEmotionEngine
formatEmotionForPrompt
情绪状态由宿主保存
```

#### 完成标准

README 能准确说明：

1. 情绪能力如何启用；
2. Core 不保存情绪状态；
3. 宿主如何传入 previous emotion；
4. Workflow 如何返回 next emotion。

---

## 十三、验收方式

### 13.1 构建验收

执行：

```bash
pnpm --filter @ying-companion/ai-core build
```

如果 demo 有独立 package：

```bash
pnpm --filter model-runtime-demo build
```

以当前实际 package name 为准。

### 13.2 人工功能验收

启动 demo 后，执行三轮对话。

#### 第 1 轮

输入：

```txt
我今天特别开心，项目终于跑通了。
```

预期：

```txt
detected: happy
next: happy
intensity > 0
```

#### 第 2 轮

输入：

```txt
但是我又有点担心后面会不会崩。
```

预期：

```txt
detected: anxious
next: anxious 或从 happy 平滑切换到 anxious
```

#### 第 3 轮

输入：

```txt
算了，先不想了，感觉好多了。
```

预期：

```txt
detected: neutral 或 happy
next intensity 下降或转为 neutral/happy
```

### 13.3 Prompt 注入验收

在 debugContext 中确认 system prompt 包含情绪块。

示例：

```txt
【当前情绪状态】
你当前对用户的情绪状态：anxious
情绪强度：0.5
```

并确认模型最终回复没有直接说：

```txt
我的情绪状态是 anxious
```

### 13.4 Observer 验收

Observer 事件中应该出现：

```txt
emotion:analyze:start
emotion:analyze:end
```

`emotion:analyze:end` 至少包含：

```txt
previous
detected
next
```

### 13.5 降级验收

可以临时让情绪模型输出异常，或在 `ModelEmotionEngine` 里模拟 parse 失败。

预期：

```txt
聊天仍然返回正常 text
result.emotion 使用 previous 或 neutral
Observer 里能看到 failed: true
```

---

## 十四、与阶段 4 的关系

阶段 4 已完成长期记忆闭环：

```txt
Memory.recall
↓
Prompt 注入
↓
Model.generate
↓
Memory.extract
↓
Memory.save
```

阶段 5 只在 generate 前增加情绪上下文：

```txt
Memory.recall
↓
Emotion.analyze
↓
Emotion.transition
↓
Prompt 注入 Memory + Emotion
↓
Model.generate
```

不要把情绪状态写入长期记忆。

如果用户明确表达了稳定偏好或事实，例如：

```txt
我每次上线前都会很焦虑。
```

是否抽取为长期记忆，仍由 `MemoryExtractor` 自己判断。

情绪引擎不要主动调用 `memory.save`。

---

## 十五、与未来阶段的关系

### 15.1 阶段 6：工具调用

未来工具调用接入后，情绪状态可以作为工具上下文的一部分。

例如：

```txt
get_emotion_state
```

可以返回当前 `ChatWorkflowOutput.emotion` 或宿主保存的 emotion。

但阶段 5 不实现工具。

### 15.2 阶段 7：流程编排

阶段 7 可以把当前线性流程迁移成更明确的节点：

```txt
SafetyNode
MemoryRecallNode
EmotionNode
PromptBuildNode
GenerateNode
MemoryWriteNode
```

但只要阶段 5 保持 `EmotionEngine` 抽象稳定，未来替换成 LangGraph 节点不会破坏接口。

### 15.3 未来情绪持久化

未来如果要持久化情绪，可以新增外部包：

```txt
packages/emotion-postgres
```

或者在业务 API 层实现：

```txt
emotion_states
  session_id
  current
  intensity
  updated_at
  metadata
```

但这不属于阶段 5。

---

## 十六、风险与注意事项

### 16.1 延迟增加

阶段 5 会在主生成前增加一次模型调用：

```txt
emotion.analyze -> model.generate
```

单轮对话成本变成：

```txt
Memory.recall embedding
+ Emotion analyze
+ Main generate
+ Memory extract
+ Memory save embedding
```

因此 demo 可以默认启用，正式产品未来需要配置开关。

### 16.2 情绪 Prompt 不要过强

情绪只应该影响语气，不应该覆盖 Persona。

优先级建议：

```txt
Safety
Persona
Memory / Summary
Emotion
User Message
```

情绪不应让角色做出违背 persona 的行为。

### 16.3 不要医学化

如果用户表达焦虑、难过、痛苦，回复可以安慰，但不要把情绪分析结果变成医学诊断。

Prompt 中要避免：

```txt
你患有焦虑症
你有抑郁倾向
```

### 16.4 metadata 不作为稳定业务字段

`EmotionState.metadata` 可以用于 demo 展示，但未来不要把它当稳定数据库字段设计依据。

稳定字段只有：

```txt
current
intensity
updatedAt
```

---

## 十七、阶段完成后的目标状态

阶段 5 完成后，单轮对话链路变为：

```txt
宿主传入 message + history + previousEmotion
↓
SimpleChatWorkflow
↓
Persona.load
↓
Safety.guardInput
↓
Memory.recall
↓
Emotion.analyze
↓
Emotion.transition
↓
Prompt = Persona + Summary + Memory + Emotion + History + User Message
↓
Model.generate
↓
Safety.guardOutput
↓
Memory.extract
↓
Memory.save
↓
返回 text + nextEmotion + memories + debugContext
↓
宿主保存 nextEmotion，下一轮再传入
```

此时 Core 具备：

1. 长期记忆；
2. 语义召回；
3. 滚动摘要；
4. 情绪识别；
5. 情绪连续性；
6. 可观测调试事件；
7. 不绑定用户系统；
8. 不绑定数据库状态；
9. 可继续接阶段 6 工具调用；
10. 可继续接阶段 7 流程编排。

---

## 十八、执行顺序建议

推荐按以下顺序执行：

```txt
1. 补齐 emotion schema
2. 实现 transition 纯函数
3. 实现 ModelEmotionEngine
4. 实现 formatEmotionForPrompt
5. 修改 SimpleChatWorkflow 接入情绪
6. 扩展 DebugContext
7. 扩展 Observer payload
8. 更新 index.ts 导出
9. 更新 demo 状态保存与展示
10. 更新 README
11. 构建验收
12. 人工三轮对话验收
```

不要一开始就改 demo。

先让 `ai-core` 的情绪能力能被注入，再让 demo 消费它。

---

## 十九、最终验收清单

阶段 5 完成时，至少满足：

```txt
[ ] ai-core build 通过
[ ] ModelEmotionEngine 可被导入
[ ] createCompanionCore 可注入 emotion
[ ] SimpleChatWorkflow 会调用 emotion.analyze
[ ] SimpleChatWorkflow 会调用 emotion.transition
[ ] result.emotion 返回 nextEmotion
[ ] debugContext 中能看到 emotionContext
[ ] Observer 中能看到 emotion:analyze:start/end
[ ] demo 中能看到情绪变化
[ ] demo 能把上轮 emotion 传入下一轮
[ ] 情绪失败不会阻断聊天
[ ] memory recall/save 不受影响
[ ] ai-core 不读 env
[ ] ai-core 不连 DB
[ ] ai-core 不写 console
```

当以上全部满足，阶段 5 完成。
