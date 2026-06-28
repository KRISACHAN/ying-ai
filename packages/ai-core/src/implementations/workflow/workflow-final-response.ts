import type {
  GenerateOutput,
  GenerateStreamChunk,
  ModelRuntimeInfo,
} from "../../abstractions/model";
import type { ChatWorkflowExecutionContext } from "../../abstractions/workflow";
import { requireStateValue, type WorkflowExecutionState } from "./workflow-execution-state";
import { createSafeWorkflowError, toSafeMessage } from "./workflow-safe-error";
import type { WorkflowStreamEmitter } from "./workflow-stream-emitter";
import { runWorkflowStep } from "./workflow-step-runner";

export async function runFinalGenerateStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
): Promise<void> {
  const prompt = requireStateValue(state.prompt, "prompt");
  const existingGeneration = state.generation;
  const finalMessages = existingGeneration?.followUpMessages ?? prompt.messages;

  const finalOutput = await runWorkflowStep({
    observer: context.core.observer,
    recorder: state.recorder,
    workflowStep: "model:generate",
    legacyStep: "model:generate",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    startSummary: {
      messageCount: finalMessages.length,
      toolResultCount: existingGeneration?.toolResults.length ?? 0,
      toolsEnabled: false,
    },
    run: () =>
      context.core.model.generate({
        messages: finalMessages,
      }),
    summarize: (result) => ({
      messageCount: finalMessages.length,
      toolResultCount: existingGeneration?.toolResults.length ?? 0,
      model: result.model,
      toolCallCount: result.toolCalls?.length ?? 0,
      toolCallsDropped: (result.toolCalls?.length ?? 0) > 0,
      runtime: result.runtime,
    }),
  });
  const droppedToolCalls = finalOutput.toolCalls ?? [];

  state.generation = {
    finalOutput,
    toolCalls: existingGeneration?.toolCalls ?? [],
    toolResults: existingGeneration?.toolResults ?? [],
    droppedToolCalls,
    toolCallsDropped: droppedToolCalls.length > 0,
    rounds: existingGeneration?.rounds ?? 0,
    followUpGenerated: existingGeneration?.followUpGenerated ?? false,
    ...(existingGeneration?.followUpMessages !== undefined
      ? { followUpMessages: existingGeneration.followUpMessages }
      : {}),
  };
}

export async function runFinalStreamStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
  streamEmitter: WorkflowStreamEmitter,
): Promise<void> {
  const prompt = requireStateValue(state.prompt, "prompt");
  const existingGeneration = state.generation;
  const finalMessages = existingGeneration?.followUpMessages ?? prompt.messages;

  const finalOutput = await runWorkflowStep({
    observer: context.core.observer,
    recorder: state.recorder,
    streamEmitter,
    workflowStep: "model:stream",
    legacyStep: "model:stream",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    startSummary: {
      messageCount: finalMessages.length,
      toolResultCount: existingGeneration?.toolResults.length ?? 0,
      toolsEnabled: false,
      requiredStreaming: true,
    },
    run: async () => {
      let completeText = "";
      let lastModel: string | undefined;
      let finalRuntime: ModelRuntimeInfo | undefined;
      let finalUsage: GenerateStreamChunk["usage"] | undefined;
      let emittedDelta = false;

      try {
        for await (const chunk of context.core.model.stream({
          messages: finalMessages,
          requiredCapabilities: { streaming: true },
        })) {
          if (chunk.runtime !== undefined) {
            finalRuntime = chunk.runtime;
          }

          if (chunk.usage !== undefined) {
            finalUsage = chunk.usage;
          }

          if (chunk.model !== undefined) {
            lastModel = chunk.model;
          }

          if (chunk.text.length === 0) {
            continue;
          }

          completeText += chunk.text;
          emittedDelta = true;
          streamEmitter.emitTextDelta(chunk);
        }
      } catch (error) {
        throw createSafeWorkflowError({
          code: "model_stream_failed",
          step: "model:stream",
          message: "Model stream failed.",
          details: {
            reason: toSafeMessage(error),
            ...(emittedDelta ? { partialOutput: true } : {}),
          },
        });
      }

      if (!completeText.trim()) {
        throw createSafeWorkflowError({
          code: "model_stream_failed",
          step: "model:stream",
          message: "Model stream produced no usable text.",
          details: emittedDelta ? { partialOutput: true } : undefined,
        });
      }

      const output: GenerateOutput = {
        text: completeText,
        model: lastModel ?? finalRuntime?.usedModel ?? "",
        raw: undefined,
      };

      if (finalUsage !== undefined) {
        output.usage = finalUsage;
      }

      if (finalRuntime !== undefined) {
        output.runtime = finalRuntime;
      }

      return output;
    },
    summarize: (result) => ({
      messageCount: finalMessages.length,
      toolResultCount: existingGeneration?.toolResults.length ?? 0,
      model: result.model,
      textLength: result.text.length,
      runtime: result.runtime,
    }),
  });

  state.generation = {
    finalOutput,
    toolCalls: existingGeneration?.toolCalls ?? [],
    toolResults: existingGeneration?.toolResults ?? [],
    droppedToolCalls: [],
    toolCallsDropped: false,
    rounds: existingGeneration?.rounds ?? 0,
    followUpGenerated: existingGeneration?.followUpGenerated ?? false,
    ...(existingGeneration?.followUpMessages !== undefined
      ? { followUpMessages: existingGeneration.followUpMessages }
      : {}),
  };
}
