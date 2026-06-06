# @ying-companion/model-runtime-demo

阶段 1 Model Runtime 的 Next.js 调试应用，只负责输出环境变量读取结果与模型响应。

## 本地运行

```bash
cp apps/model-runtime-demo/.env.example apps/model-runtime-demo/.env
pnpm --filter @ying-companion/model-runtime-demo dev
```

打开 Next.js 输出的本地地址，点击「调用模型」查看结果。
