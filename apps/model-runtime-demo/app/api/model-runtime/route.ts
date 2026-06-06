import { createModel, type CreateModelOptions } from "@ying-companion/ai-core";

export async function POST() {
  const config = loadModelConfig(process.env);
  const model = createModel(config);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`OPENAI_API_KEY: ${maskSecret(config.apiKey)}\n`));
      controller.enqueue(encoder.encode(`OPENAI_BASE_URL: ${config.baseUrl}\n`));
      controller.enqueue(encoder.encode(`OPENAI_MODEL: ${config.model}\n\n`));
      controller.enqueue(encoder.encode("[Model Stream]\n"));

      try {
        for await (const chunk of model.stream({
          messages: [{ role: "user", content: "你好，请用中文流式输出一句话，确认模型运行正常。" }],
        })) {
          controller.enqueue(encoder.encode(chunk.text));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "模型流式调用失败";
        controller.enqueue(encoder.encode(`\n\n[Error]\n${message}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function loadModelConfig(env: NodeJS.ProcessEnv): CreateModelOptions {
  return {
    apiKey: readRequiredEnv(env, "OPENAI_API_KEY"),
    baseUrl: readRequiredEnv(env, "OPENAI_BASE_URL"),
    model: readRequiredEnv(env, "OPENAI_MODEL"),
  };
}

function readRequiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "********";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
