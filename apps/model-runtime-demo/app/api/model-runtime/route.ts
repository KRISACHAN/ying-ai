import {
  createCompanionCore,
  type CompanionCoreInspection,
  ModelCapabilityUnavailableError,
  ModelRuntimeError,
  type ModelCapabilitySkipItem,
  type ModelRuntimeErrorItem,
  type ModelRuntimeInfo,
} from "@ying-companion/ai-core";

import { loadModelConfig, maskSecret } from "../../lib/model-config";
import { createConfiguredModel, describeModelFactoryResult } from "../../lib/model-factory";

export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const config = loadModelConfig(process.env);
        const model = createConfiguredModel(config);
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
        controller.enqueue(
          encoder.encode(`${formatModelFactoryInfo(describeModelFactoryResult(model))}\n\n`),
        );
        controller.enqueue(encoder.encode("[Model Stream]\n"));

        for await (const chunk of model.stream({
          messages: [{ role: "user", content: "你好，请用中文流式输出一句话，确认模型运行正常。" }],
          requiredCapabilities: { streaming: true },
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
    `used profile: ${formatProfile(runtime.usedProfile)}`,
    `fallback used: ${runtime.fallbackUsed ? "true" : "false"}`,
    `primary attempts: ${runtime.primaryAttempts}`,
    `fallback attempts: ${runtime.fallbackAttempts}`,
    "",
    "[Model Runtime Errors]",
    ...formatRuntimeErrors(runtime.errors),
    "",
    "[Capability Skips]",
    ...formatCapabilitySkips(runtime.capabilitySkips ?? []),
  ].join("\n");
}

function formatModelFactoryInfo(info: ReturnType<typeof describeModelFactoryResult>): string {
  return [
    "[Model Factory]",
    `provider: ${info.provider}`,
    `strategy: ${info.strategy}`,
    `primary profile: ${formatProfile(info.primaryProfile)}`,
    `fallback profile: ${formatProfile(info.fallbackProfile)}`,
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
  if (error instanceof ModelCapabilityUnavailableError) {
    return [
      "[Model Capability Error]",
      error.message,
      "",
      "[Capability Skips]",
      ...formatCapabilitySkips(error.capabilitySkips),
    ].join("\n");
  }

  if (error instanceof ModelRuntimeError) {
    return [
      "[Model Runtime Error]",
      error.message,
      "",
      "[Model Runtime Errors]",
      ...formatRuntimeErrors(error.errors),
      "",
      "[Capability Skips]",
      ...formatCapabilitySkips(error.capabilitySkips),
    ].join("\n");
  }

  const message = error instanceof Error ? error.message : "模型流式调用失败";
  return ["[Error]", message].join("\n");
}

function formatProfile(profile: ModelRuntimeInfo["usedProfile"]): string {
  if (profile === undefined) {
    return "(none)";
  }

  return `${profile.provider}/${profile.model} ${JSON.stringify(profile.capabilities)}`;
}

function formatCapabilitySkips(skips: ModelCapabilitySkipItem[]): string[] {
  if (skips.length === 0) {
    return ["none"];
  }

  return skips.map(
    (skip) =>
      `${skip.profile.provider}/${skip.profile.model}: required=${JSON.stringify(
        skip.requiredCapabilities,
      )}, capabilities=${JSON.stringify(skip.profile.capabilities)}`,
  );
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
