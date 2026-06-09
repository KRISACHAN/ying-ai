# @ying-companion/model-runtime-demo

阶段 1 Model Runtime 与阶段 2 Core Abstractions 的 Next.js 调试应用，只负责输出环境变量读取结果、Core 初始化信息、模型响应、重试与降级结果。

## 环境变量

```txt
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=
OPENAI_FALLBACK_MODEL=
OPENAI_PRIMARY_MAX_RETRIES=1
OPENAI_FALLBACK_MAX_RETRIES=1
```

`OPENAI_FALLBACK_MODEL` 为空时不启用降级。重试次数为空或非法时按 `0` 处理。

## 本地运行

```bash
cp apps/model-runtime-demo/.env.example apps/model-runtime-demo/.env
pnpm --filter @ying-companion/model-runtime-demo dev
```

打开 Next.js 输出的本地地址，点击「调用模型」查看 Core Provider inspection、流式输出、最终使用模型、是否降级、尝试次数与错误摘要。
