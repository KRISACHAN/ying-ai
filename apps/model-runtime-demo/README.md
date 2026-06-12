# @ying-companion/model-runtime-demo

阶段 1 Model Runtime、阶段 2 Core Abstractions 与阶段 3 Simple Chat Workflow 的 Next.js 调试应用，只负责输出环境变量读取结果、Core 初始化信息、模型响应、重试与降级结果，以及聊天主链路的可观测输出。

## 环境变量

```txt
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=
OPENAI_FALLBACK_MODEL=
OPENAI_PRIMARY_MAX_RETRIES=1
OPENAI_FALLBACK_MAX_RETRIES=1
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
DATABASE_URL=
MEMORY_POSTGRES_TABLE=companion_memories
```

`OPENAI_FALLBACK_MODEL` 为空时不启用降级。重试次数为空或非法时按 `0` 处理。
`DATABASE_URL` 为空时聊天调试使用进程内 `InMemoryMemoryProvider`；填写后使用
`PostgresMemoryProvider`，并通过 `OPENAI_EMBEDDING_MODEL` 调用 OpenAI-compatible embedding
接口。使用 PostgreSQL 前先执行
`packages/memory-postgres/migrations/0001_create_companion_memories.sql`，确保 `pgvector` 可用。

## 本地运行

```bash
cp apps/model-runtime-demo/.env.example apps/model-runtime-demo/.env
pnpm --filter @ying-companion/model-runtime-demo dev
```

打开 Next.js 输出的本地地址：

- 「AI Core 调试输出」点击「调用模型」查看 Core Provider inspection、流式输出、最终使用模型、是否降级、尝试次数与错误摘要。
- 「聊天主链路调试」输入消息后发送，经服务端 `app/api/chat` 路由调用 `core.executeWorkflow()`，展示最终回复、长期记忆召回 / 抽取 / 保存结果、Persona / Safety / Metadata / 模型原始输出，以及服务端收集后回传的 Observer 事件。history 由页面维护并随请求传入，Core 不保存；长期记忆由当前 memory provider 维护。
