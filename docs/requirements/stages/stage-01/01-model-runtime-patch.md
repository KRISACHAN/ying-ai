# AI Companion Core V1 - 阶段 1：Model Runtime 补丁说明

> 本文件是 `01-model-runtime.md` 的补丁文件，用于记录阶段 1 实施后的调试入口调整。

## 一、补丁背景

原阶段文档要求提供可观测运行结果，并以 console 输出验证模型回复。

实施过程中发现，`packages/ai-core` 应保持为纯 Core SDK，不应该长期承载 demo 或人工调试脚本。否则后续 SDK 构建、业务调试、应用调试会混在一起。

因此补丁将「模型调用 demo 输出」移动到 `apps/` 下的独立 Next.js 调试应用。

---

## 二、补丁内容

新增：

```txt
apps/model-runtime-demo
```

该应用只负责：

1. 读取 `OPENAI_API_KEY`
2. 读取 `OPENAI_BASE_URL`
3. 读取 `OPENAI_MODEL`
4. 将模型配置作为参数传给 `@ying-companion/ai-core`
5. 在页面以流式输出方式展示模型响应

同时补充 `@ying-companion/ai-core` 的流式模型接口：

```ts
model.stream(input);
```

该接口返回 `AsyncIterable`。底层流式协议由 Vercel AI SDK 的 `streamText` 处理，Core 只保留项目自己的流式抽象。

---

## 三、职责边界

`packages/ai-core`：

- 保留模型抽象
- 保留 OpenAI-compatible 实现
- 通过 Vercel AI SDK 适配 OpenAI-compatible Provider
- 支持普通生成与流式生成
- 保留 Model Factory
- 不读取环境变量
- 不承载 demo 页面
- 不承载人工 smoke 调试脚本

`apps/model-runtime-demo`：

- 作为阶段 1 的人工调试入口
- 只展示模型运行时结果
- 不接入用户系统
- 不承担正式前端 UI 职责

---

## 四、运行方式

```bash
cp apps/model-runtime-demo/.env.example apps/model-runtime-demo/.env
pnpm --filter @ying-companion/model-runtime-demo dev
```

打开 Next.js 输出的本地地址，点击「调用模型」。

如果页面逐段展示模型回复，则阶段 1 的补丁验证通过。

---

## 五、补丁后的完成标准

阶段 1 完成标准调整为：

- `@ying-companion/ai-core` 可被独立构建
- `@ying-companion/ai-core` 不直接依赖 OpenAI 官方 SDK
- `@ying-companion/ai-core` 使用 Vercel AI SDK 承接模型协议细节
- `@ying-companion/ai-core` 支持流式模型输出
- `@ying-companion/ai-core` 不读取环境变量，配置由业务方参数传入
- `apps/model-runtime-demo` 可读取模型环境变量
- `apps/model-runtime-demo` 可调用模型并流式展示回复
- demo 输出与 Core SDK 构建职责分离
