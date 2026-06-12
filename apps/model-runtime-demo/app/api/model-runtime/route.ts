import {
  createCompanionCore,
  createModel,
  type CompanionCoreInspection,
  ModelRuntimeError,
  type ModelRuntimeErrorItem,
  type ModelRuntimeInfo,
} from "@ying-companion/ai-core";

import { loadModelConfig, maskSecret } from "../../lib/model-config";

export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const config = loadModelConfig(process.env);
        const model = createModel(config);
        const core = createCompanionCore({
          model,
        });
        let runtime: ModelRuntimeInfo | undefined;

        controller.enqueue(encoder.encode(`OPENAI_API_KEY: ${maskSecret(config.apiKey)}\n`));
        controller.enqueue(encoder.encode(`OPENAI_BASE_URL: ${config.baseUrl ?? "(default)"}\n`));
        controller.enqueue(encoder.encode(`OPENAI_MODEL: ${config.model}\n\n`));
        controller.enqueue(
          encoder.encode(`OPENAI_FALLBACK_MODEL: ${config.fallbackModel ?? "(disabled)"}\n`),
        );
        controller.enqueue(
          encoder.encode(`OPENAI_PRIMARY_MAX_RETRIES: ${config.retry?.primaryMaxRetries ?? 0}\n`),
        );
        controller.enqueue(
          encoder.encode(
            `OPENAI_FALLBACK_MAX_RETRIES: ${config.retry?.fallbackMaxRetries ?? 0}\n\n`,
          ),
        );
        controller.enqueue(encoder.encode(`${formatCoreInspection(core.inspect())}\n\n`));
        controller.enqueue(encoder.encode("[Model Stream]\n"));

        for await (const chunk of model.stream({
          messages: [{ role: "user", content: "你好，请用中文流式输出一句话，确认模型运行正常。" }],
        })) {
          controller.enqueue(encoder.encode(chunk.text));

          if (chunk.runtime !== undefined) {
            runtime = chunk.runtime;
          }
        }

        if (runtime !== undefined) {
          controller.enqueue(encoder.encode(`\n\n${formatRuntimeInfo(runtime)}`));
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`\n\n${formatRuntimeError(error)}`));
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

function formatRuntimeInfo(runtime: ModelRuntimeInfo): string {
  return [
    "[Model Runtime Result]",
    `used model: ${runtime.usedModel}`,
    `fallback used: ${runtime.fallbackUsed ? "true" : "false"}`,
    `primary attempts: ${runtime.primaryAttempts}`,
    `fallback attempts: ${runtime.fallbackAttempts}`,
    "",
    "[Model Runtime Errors]",
    ...formatRuntimeErrors(runtime.errors),
  ].join("\n");
}

function formatCoreInspection(inspection: CompanionCoreInspection): string {
  const providers = inspection.providers;

  return [
    "[Core Inspection]",
    "Core Initialized: true",
    "",
    "Providers:",
    `model: ${providers.model.id}`,
    `persona: ${providers.persona.id}`,
    `memory: ${providers.memory.id}`,
    `memory extractor: ${providers.memoryExtractor.id}`,
    `emotion: ${providers.emotion.id}`,
    `tools: ${providers.tools.id}`,
    `safety: ${providers.safety.id}`,
    `workflow: ${providers.workflow.id}`,
    `observer: ${providers.observer.id}`,
  ].join("\n");
}

function formatRuntimeError(error: unknown): string {
  if (error instanceof ModelRuntimeError) {
    return [
      "[Model Runtime Error]",
      error.message,
      "",
      "[Model Runtime Errors]",
      ...formatRuntimeErrors(error.errors),
    ].join("\n");
  }

  const message = error instanceof Error ? error.message : "模型流式调用失败";
  return ["[Error]", message].join("\n");
}

function formatRuntimeErrors(errors: ModelRuntimeErrorItem[]): string[] {
  if (errors.length === 0) {
    return ["none"];
  }

  return errors.map(
    (error) =>
      `phase: ${error.phase}, model: ${error.model}, attempt: ${error.attempt}, message: ${error.message}`,
  );
}
