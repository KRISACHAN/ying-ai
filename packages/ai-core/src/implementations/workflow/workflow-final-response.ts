/**
 * 最终用户回复生成边界。
 *
 * 工具规划与执行在进入本模块前已经结束，因此最终 generate/stream 均不再传 tools，
 * 防止模型在最后阶段发起未规划调用。两条路径把结果写回同一 generation 状态，供后续
 * Output Safety、Summary、Memory 与输出构建共享。
 */
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

/** 非流式最终生成；意外返回的 toolCalls 只记录为 dropped，不再执行。 */
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

/**
 * 流式最终生成；只转发非空 delta，保留空白字符，并将所有 delta 原样聚合为 finalOutput。
 * 已输出 delta 后发生错误时以 partialOutput 标记失败，绝不发送 workflow:finish。
 */
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
