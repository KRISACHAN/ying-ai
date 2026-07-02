/**
 * 当前 V1 聊天主链路实现（阶段 3～6）。
 *
 * 编排顺序：Persona → Safety(input) → Summary(load) → Memory(recall)
 * → Emotion(analyze/transition) → ToolRegistry.list → Prompt.build
 * → ToolPlanningProvider.plan → ToolRegistry.execute → final generate → Safety(output)
 * → Summary(update/save) → Memory(extract/save)。
 */
import type { ToolPlanningProvider } from "../../abstractions/tool-planning";
import type {
  ChatWorkflow,
  ChatWorkflowExecutionContext,
  ChatWorkflowInput,
  ChatWorkflowOutput,
} from "../../abstractions/workflow";
import type { ChatWorkflowStreamEvent } from "../../abstractions/workflow-stream";
import type { WorkflowErrorEventPayload } from "../../abstractions/workflow-trace";
import { formatEmotionForPrompt } from "../emotion/prompt-formatter";
import { formatMemoriesForPrompt } from "../memory/prompt-formatter";
import { buildPersonaSystemPrompt } from "../persona/persona-prompt-builder";
import { formatSummaryForPrompt } from "../summary/prompt-formatter";
import { DefaultToolPlanningProvider } from "../tool-planning/default-tool-planning-provider";
import { buildToolFollowUpMessages, toModelTools } from "../tool/tool-adapter";
import {
  createWorkflowExecutionState,
  requireStateValue,
  type WorkflowExecutionState,
} from "./workflow-execution-state";
import { runFinalGenerateStep, runFinalStreamStep } from "./workflow-final-response";
import { buildWorkflowOutput } from "./workflow-output-builder";
import { createSafeWorkflowError, toSafeMessage, toSafeWorkflowError } from "./workflow-safe-error";
import { runWorkflowStep, safeEmit } from "./workflow-step-runner";
import {
  analyzeAndTransitionEmotion,
  createPlaceholderGenerateOutput,
  extractAndSaveMemories,
  listTools,
  loadSummary,
  normalizeToolPlan,
  recallMemories,
  toToolPlanningState,
  updateAndSaveSummary,
} from "./workflow-steps";
import { WorkflowStreamEmitter } from "./workflow-stream-emitter";
import { executeToolCalls } from "./workflow-tool-execution";

const DEFAULT_MAX_TOOL_ROUNDS = 1;

export interface SimpleChatWorkflowOptions {
  /**
   * undefined 使用默认无状态规划器；null 显式关闭规划器，用于宿主自定义 Workflow 策略。
   */
  toolPlanningProvider?: ToolPlanningProvider | null;
}

/**
 * 阶段 4 聊天主链路：Persona → Safety(input) → Summary(load) → Memory(recall)
 * → Emotion(analyze/transition) → ToolRegistry.list → Prompt.build
 * → ToolPlanning → ToolRegistry.execute → final generate → Safety(output)
 * → Summary(update/save) → Memory(extract/save)。
 *
 * 约束：
 * - Memory 失败不得打断主聊天链路；
 * - Emotion 失败不得打断主聊天链路；
 * - V1.1 Stage 4 只支持非流式 final generate，工具调用必须先经规划；
 * - 不保存 history，history 由宿主通过 ChatWorkflowInput.history 传入；
 * - 不读取环境变量、不写 console；
 * - Observer 事件失败不得打断主链路；
 * - Safety 拒绝统一抛错，不返回伪回复或未通过检查的模型文本。
 */
export class SimpleChatWorkflow implements ChatWorkflow {
  public readonly meta = {
    id: "workflow.simple-chat",
    kind: "workflow",
    name: "Simple Chat Workflow",
    description: "Minimal persona + safety + model chat workflow",
  } as const;

  private readonly toolPlanningProvider: ToolPlanningProvider | null | undefined;

  public constructor(options: SimpleChatWorkflowOptions = {}) {
    this.toolPlanningProvider = options.toolPlanningProvider;
  }

  /** 执行单轮聊天主链路，详见类级注释中的编排顺序与约束。 */
  public async execute(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): Promise<ChatWorkflowOutput> {
    const { observer } = context.core;
    const sessionId = input.sessionId;
    const state = createWorkflowExecutionState(input);

    await safeEmit(observer, {
      type: "workflow:start",
      timestamp: new Date(),
      payload: { sessionId, workflowId: state.recorder.workflowId },
    });

    try {
      if (typeof input.message !== "string" || input.message.trim() === "") {
        throw new Error("ChatWorkflowInput.message is required");
      }

      await runPersonaStep(state, context);
      await runInputSafetyStep(state, context);
      await runSummaryLoadStep(state, context);
      await runMemoryRecallStep(state, context);
      await runEmotionStep(state, context);
      await runToolListStep(state, context);
      await runPromptBuildStep(state, context);
      await runToolPlanningStep(state, context, this.resolveToolPlanningProvider());
      await runToolExecuteStep(state, context);
      await runFinalGenerateStep(state, context);
      await runOutputSafetyStep(state, context);
      await runSummarySaveStep(state, context);
      await runMemoryExtractSaveStep(state, context);

      const output = buildWorkflowOutput(state);
      const trace = state.recorder.snapshot();
      const modelOutput = requireStateValue(state.generation, "generation").finalOutput;

      await safeEmit(observer, {
        type: "workflow:end",
        timestamp: new Date(),
        payload: {
          sessionId,
          workflowId: state.recorder.workflowId,
          model: modelOutput.model,
          textLength: output.text.length,
          durationMs: trace.durationMs,
          budgetExceeded: trace.budgetExceeded,
          status: trace.status,
        },
      });

      return output;
    } catch (error) {
      await safeEmit(observer, {
        type: "workflow:error",
        timestamp: new Date(),
        payload: {
          workflowId: state.recorder.workflowId,
          ...(sessionId !== undefined ? { sessionId } : {}),
          message: toSafeMessage(error),
          trace: state.recorder.snapshot("failed"),
        } satisfies WorkflowErrorEventPayload,
      });
      throw error;
    }
  }

  /** 输出工作流级真实流式事件；业务步骤复用 execute() 的共享步骤。 */
  public async *stream(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): AsyncIterable<ChatWorkflowStreamEvent> {
    const state = createWorkflowExecutionState(input);
    const emitter = new WorkflowStreamEmitter(state.recorder.workflowId);
    const producer = this.runStreamProducer(input, context, state, emitter).catch((error) => {
      emitter.fail(error);
    });

    for await (const event of emitter.events()) {
      yield event;
    }

    await producer;
  }

  private async runStreamProducer(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
    state: WorkflowExecutionState,
    streamEmitter: WorkflowStreamEmitter,
  ): Promise<void> {
    const { observer } = context.core;
    const sessionId = input.sessionId;

    streamEmitter.emitWorkflowStart();
    await safeEmit(observer, {
      type: "workflow:start",
      timestamp: new Date(),
      payload: { sessionId, workflowId: state.recorder.workflowId },
    });

    try {
      if (typeof input.message !== "string" || input.message.trim() === "") {
        throw createSafeWorkflowError({
          code: "workflow_failed",
          message: "ChatWorkflowInput.message is required",
        });
      }

      await runPersonaStep(state, context, streamEmitter);
      await runInputSafetyStep(state, context, streamEmitter);
      await runSummaryLoadStep(state, context, streamEmitter);
      await runMemoryRecallStep(state, context, streamEmitter);
      await runEmotionStep(state, context, streamEmitter);
      await runToolListStep(state, context, streamEmitter);
      await runPromptBuildStep(state, context, streamEmitter);
      await runToolPlanningStep(state, context, this.resolveToolPlanningProvider(), streamEmitter);
      await runToolExecuteStep(state, context, streamEmitter);
      await runFinalStreamStep(state, context, streamEmitter);
      await runOutputSafetyStep(state, context, streamEmitter);
      await runSummarySaveStep(state, context, streamEmitter);
      await runMemoryExtractSaveStep(state, context, streamEmitter);

      const output = buildWorkflowOutput(state);
      const trace = state.recorder.snapshot();
      const modelOutput = requireStateValue(state.generation, "generation").finalOutput;

      await safeEmit(observer, {
        type: "workflow:end",
        timestamp: new Date(),
        payload: {
          sessionId,
          workflowId: state.recorder.workflowId,
          model: modelOutput.model,
          textLength: output.text.length,
          durationMs: trace.durationMs,
          budgetExceeded: trace.budgetExceeded,
          status: trace.status,
        },
      });

      streamEmitter.emitFinish(output);
    } catch (error) {
      const safeError = toSafeWorkflowError(error);

      await safeEmit(observer, {
        type: "workflow:error",
        timestamp: new Date(),
        payload: {
          workflowId: state.recorder.workflowId,
          ...(sessionId !== undefined ? { sessionId } : {}),
          message: safeError.message,
          trace: state.recorder.snapshot("failed"),
        } satisfies WorkflowErrorEventPayload,
      });

      streamEmitter.emitError(safeError);
    }
  }

  private resolveToolPlanningProvider(): ToolPlanningProvider | null {
    if (this.toolPlanningProvider !== undefined) {
      return this.toolPlanningProvider;
    }

    return new DefaultToolPlanningProvider();
  }
}

async function runPersonaStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
  streamEmitter?: WorkflowStreamEmitter,
): Promise<void> {
  const { observer, persona } = context.core;
  const { sessionId } = state;

  state.persona = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    streamEmitter,
    workflowStep: "persona:load",
    legacyStep: "persona:load",
    ...(sessionId !== undefined ? { sessionId } : {}),
    run: async () => {
      await safeEmit(observer, {
        type: "persona:load:start",
        timestamp: new Date(),
        payload: { sessionId },
      });
      const result = await persona.load(sessionId !== undefined ? { sessionId } : undefined);
      await safeEmit(observer, {
        type: "persona:load:end",
        timestamp: new Date(),
        payload: { sessionId, personaId: result.id },
      });

      return result;
    },
    summarize: (result) => ({ personaId: result.id }),
  });
}

async function runInputSafetyStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
  streamEmitter?: WorkflowStreamEmitter,
): Promise<void> {
  const { observer, safety } = context.core;
  const { sessionId } = state;

  state.inputSafety = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    streamEmitter,
    workflowStep: "safety:input",
    legacyStep: "safety:input",
    ...(sessionId !== undefined ? { sessionId } : {}),
    run: async () => {
      await safeEmit(observer, {
        type: "safety:input:start",
        timestamp: new Date(),
        payload: { sessionId },
      });
      const result = await safety.guardInput({
        text: state.input.message,
        ...(sessionId !== undefined && { sessionId }),
      });
      await safeEmit(observer, {
        type: "safety:input:end",
        timestamp: new Date(),
        payload: { sessionId, allowed: result.allowed },
      });

      return result;
    },
    status: (result) => (result.allowed ? "success" : "failed"),
    summarize: (result) => ({ allowed: result.allowed }),
  });

  if (!state.inputSafety.allowed) {
    throw createSafeWorkflowError({
      code: "input_safety_rejected",
      step: "safety:input",
      message: "Input rejected by SafetyProvider",
    });
  }
}

async function runSummaryLoadStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
  streamEmitter?: WorkflowStreamEmitter,
): Promise<void> {
  const { observer, summary } = context.core;

  const summaryLoad = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    streamEmitter,
    workflowStep: "summary:load",
    legacyStep: "summary:load",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    run: () =>
      loadSummary({
        observer,
        summary,
        enabled: state.summaryEnabled,
        ...(state.summaryScope !== undefined ? { scope: state.summaryScope } : {}),
        ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
      }),
    status: (result) =>
      result.skipped ? (result.reason === "load_failed" ? "degraded" : "skipped") : "success",
    summarize: (result) => ({
      enabled: state.summaryEnabled,
      hasSummary: result.summary !== null,
      skipped: result.skipped,
      reason: result.reason,
    }),
  });
  state.summary = summaryLoad.summary;
}

async function runMemoryRecallStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
  streamEmitter?: WorkflowStreamEmitter,
): Promise<void> {
  const { observer, memory } = context.core;

  state.recall = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    streamEmitter,
    workflowStep: "memory:recall",
    legacyStep: "memory:recall",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    run: () =>
      recallMemories({
        observer,
        memory,
        scope: state.memoryScope,
        query: state.input.message,
        limit: state.input.memoryOptions?.limit ?? 5,
        minImportance: state.input.memoryOptions?.minImportance ?? 3,
        ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
      }),
    status: (result) => (result.degraded ? "degraded" : "success"),
    summarize: (result) => ({
      count: result.memories.length,
      ...(result.embeddingVectorLength !== undefined
        ? { embeddingVectorLength: result.embeddingVectorLength }
        : {}),
      ...(result.degraded ? { degraded: true, reason: result.reason } : {}),
    }),
  });
}

async function runEmotionStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
  streamEmitter?: WorkflowStreamEmitter,
): Promise<void> {
  const { observer, emotion } = context.core;

  state.emotion = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    streamEmitter,
    workflowStep: "emotion:analyze",
    legacyStep: "emotion:analyze",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    run: () =>
      analyzeAndTransitionEmotion({
        observer,
        emotion,
        message: state.input.message,
        history: state.recentHistory,
        persona: requireStateValue(state.persona, "persona"),
        recalledMemories: requireStateValue(state.recall, "recall").memories,
        ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
        ...(state.input.emotion !== undefined ? { previous: state.input.emotion } : {}),
      }),
    status: (result) => (result.degraded ? "degraded" : "success"),
    summarize: (result) => ({
      previous: result.previous.current,
      next: result.next.current,
      ...(result.detected !== undefined ? { detected: result.detected.current } : {}),
      ...(result.degraded ? { degraded: true, reason: result.reason } : {}),
    }),
  });
}

async function runToolListStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
  streamEmitter?: WorkflowStreamEmitter,
): Promise<void> {
  state.toolDefinitions = await listTools({
    observer: context.core.observer,
    recorder: state.recorder,
    streamEmitter,
    tools: context.core.tools,
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
  });
}

async function runPromptBuildStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
  streamEmitter?: WorkflowStreamEmitter,
): Promise<void> {
  const summary = state.summary ?? null;
  const recall = requireStateValue(state.recall, "recall");
  const emotion = requireStateValue(state.emotion, "emotion");

  state.prompt = await runWorkflowStep({
    observer: context.core.observer,
    recorder: state.recorder,
    streamEmitter,
    workflowStep: "prompt:build",
    legacyStep: "prompt:build",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    run: async () => {
      const summaryContext = formatSummaryForPrompt(summary);
      const memoryContext = formatMemoriesForPrompt(recall.memories);
      const emotionContext = formatEmotionForPrompt(emotion.next);
      const built = buildPersonaSystemPrompt(requireStateValue(state.persona, "persona"), {
        ...(summaryContext !== undefined ? { summaryContext } : {}),
        ...(memoryContext !== undefined ? { memoryContext } : {}),
        ...(emotionContext !== undefined ? { emotionContext } : {}),
        toolDefinitions: state.toolDefinitions,
      });

      return {
        persona: built.persona,
        personaPrompt: built.personaPrompt,
        systemPrompt: built.systemPrompt,
        ...(summaryContext !== undefined ? { summaryContext } : {}),
        ...(memoryContext !== undefined ? { memoryContext } : {}),
        ...(emotionContext !== undefined ? { emotionContext } : {}),
        messages: [
          { role: "system", content: built.systemPrompt },
          ...state.recentHistory,
          { role: "user", content: state.input.message },
        ],
      };
    },
    summarize: (result) => ({
      hasSummaryContext: result.summaryContext !== undefined,
      hasMemoryContext: result.memoryContext !== undefined,
      hasEmotionContext: result.emotionContext !== undefined,
      toolDefinitionCount: state.toolDefinitions.length,
      messageCount: result.messages.length,
    }),
  });
}

async function runToolPlanningStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
  planner: ToolPlanningProvider | null,
  streamEmitter?: WorkflowStreamEmitter,
): Promise<void> {
  const { observer, model } = context.core;
  const modelTools = toModelTools(state.toolDefinitions);

  state.toolPlanning = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    streamEmitter,
    workflowStep: "tool:plan",
    legacyStep: "tool:plan",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    startSummary: {
      toolDefinitionCount: state.toolDefinitions.length,
      plannerConfigured: planner !== null,
    },
    run: async () => {
      if (modelTools === undefined) {
        return {
          plan: { type: "no_tool", reason: "no_tools" },
          reason: "no_tools",
        };
      }

      if (planner === null) {
        return {
          plan: { type: "no_tool", reason: "planner_unavailable" },
          reason: "planner_unavailable",
          plannerUnavailableSource: "not_configured",
        };
      }

      try {
        const plan = await planner.plan({
          model,
          messages: requireStateValue(state.prompt, "prompt").messages,
          tools: modelTools,
        });
        const normalized = normalizeToolPlan(plan);

        if (normalized === null) {
          return {
            plan: { type: "no_tool", reason: "invalid_plan" },
            reason: "invalid_plan",
          };
        }

        return toToolPlanningState(normalized);
      } catch {
        return {
          plan: { type: "no_tool", reason: "planner_unavailable" },
          reason: "planner_unavailable",
          plannerUnavailableSource: "execution_failed",
        };
      }
    },
    status: (result) => {
      if (result.reason === "no_tools") {
        return "skipped";
      }

      return result.reason === undefined ? "success" : "degraded";
    },
    summarize: (result) => ({
      planType: result.plan.type,
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
      ...(result.plannerUnavailableSource !== undefined
        ? { plannerUnavailableSource: result.plannerUnavailableSource }
        : {}),
      toolCallCount: result.plan.type === "tool_calls" ? result.plan.calls.length : 0,
      ...(result.runtime !== undefined ? { runtime: result.runtime } : {}),
    }),
  });
}

async function runToolExecuteStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
  streamEmitter?: WorkflowStreamEmitter,
): Promise<void> {
  const plan = requireStateValue(state.toolPlanning, "toolPlanning").plan;

  if (plan.type !== "tool_calls") {
    await runWorkflowStep({
      observer: context.core.observer,
      recorder: state.recorder,
      streamEmitter,
      workflowStep: "tool:execute",
      legacyStep: "tool:execute",
      ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
      run: async () => [],
      status: () => "skipped",
      summarize: () => ({ requestedCount: 0, resultCount: 0, failedCount: 0 }),
    });
    state.generation = {
      finalOutput: createPlaceholderGenerateOutput(),
      toolCalls: [],
      toolResults: [],
      droppedToolCalls: [],
      toolCallsDropped: false,
      rounds: 0,
      followUpGenerated: false,
    };
    return;
  }

  if (DEFAULT_MAX_TOOL_ROUNDS < 1) {
    await runWorkflowStep({
      observer: context.core.observer,
      recorder: state.recorder,
      streamEmitter,
      workflowStep: "tool:execute",
      legacyStep: "tool:execute",
      ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
      run: async () => [],
      status: () => "skipped",
      summarize: () => ({
        requestedCount: plan.calls.length,
        resultCount: 0,
        failedCount: 0,
        reason: "max_tool_rounds_exceeded",
      }),
    });
    state.generation = {
      finalOutput: createPlaceholderGenerateOutput(),
      toolCalls: plan.calls,
      toolResults: [],
      droppedToolCalls: plan.calls,
      toolCallsDropped: plan.calls.length > 0,
      rounds: 0,
      followUpGenerated: false,
    };
    return;
  }

  const emotion = requireStateValue(state.emotion, "emotion");
  const toolResults = await executeToolCalls({
    observer: context.core.observer,
    recorder: state.recorder,
    streamEmitter,
    tools: context.core.tools,
    toolCalls: plan.calls,
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    metadata: {
      ...(state.input.metadata ?? {}),
      currentEmotion: emotion.next,
    },
  });
  state.generation = {
    finalOutput: createPlaceholderGenerateOutput(),
    toolCalls: plan.calls,
    toolResults,
    droppedToolCalls: [],
    toolCallsDropped: false,
    rounds: 1,
    followUpGenerated: true,
    followUpMessages: buildToolFollowUpMessages(
      requireStateValue(state.prompt, "prompt").messages,
      "",
      plan.calls,
      toolResults,
    ),
  };
}

async function runOutputSafetyStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
  streamEmitter?: WorkflowStreamEmitter,
): Promise<void> {
  const { observer, safety } = context.core;
  const modelOutput = requireStateValue(state.generation, "generation").finalOutput;

  state.outputSafety = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    streamEmitter,
    workflowStep: "safety:output",
    legacyStep: "safety:output",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    run: async () => {
      await safeEmit(observer, {
        type: "safety:output:start",
        timestamp: new Date(),
        payload: { sessionId: state.sessionId },
      });
      const result = await safety.guardOutput({
        text: modelOutput.text,
        ...(state.sessionId !== undefined && { sessionId: state.sessionId }),
      });
      await safeEmit(observer, {
        type: "safety:output:end",
        timestamp: new Date(),
        payload: { sessionId: state.sessionId, allowed: result.allowed },
      });

      return result;
    },
    status: (result) => (result.allowed ? "success" : "failed"),
    summarize: (result) => ({ allowed: result.allowed }),
  });

  if (!state.outputSafety.allowed) {
    throw createSafeWorkflowError({
      code: "output_safety_rejected",
      step: "safety:output",
      message: "Output rejected by SafetyProvider",
    });
  }
}

async function runSummarySaveStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
  streamEmitter?: WorkflowStreamEmitter,
): Promise<void> {
  const { observer, summary, summaryUpdater } = context.core;
  const modelOutput = requireStateValue(state.generation, "generation").finalOutput;

  state.summaryResult = await runWorkflowStep({
    observer,
    recorder: state.recorder,
    streamEmitter,
    workflowStep: "summary:save",
    legacyStep: "summary:save",
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    run: () =>
      updateAndSaveSummary({
        observer,
        summary,
        summaryUpdater,
        enabled: state.summaryEnabled,
        ...(state.summaryScope !== undefined ? { scope: state.summaryScope } : {}),
        currentSummary: state.summary ?? null,
        history: state.sanitizedHistory,
        userMessage: state.input.message,
        assistantMessage: modelOutput.text,
        recentMessageLimit: state.recentMessageLimit,
        summarizeTriggerMessageCount: state.summarizeTriggerMessageCount,
        ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
      }),
    status: (result) =>
      result.skipped ? (result.reason.endsWith("_failed") ? "degraded" : "skipped") : "success",
    summarize: (result) => ({
      skipped: result.skipped,
      reason: result.reason,
      summarizedMessageCount: result.summarizedMessages.length,
      hasUpdatedSummary: result.updatedSummary !== null,
    }),
  });
}

async function runMemoryExtractSaveStep(
  state: WorkflowExecutionState,
  context: ChatWorkflowExecutionContext,
  streamEmitter?: WorkflowStreamEmitter,
): Promise<void> {
  const modelOutput = requireStateValue(state.generation, "generation").finalOutput;
  const generation = requireStateValue(state.generation, "generation");

  state.memoryResult = await extractAndSaveMemories({
    observer: context.core.observer,
    recorder: state.recorder,
    streamEmitter,
    memory: context.core.memory,
    memoryExtractor: context.core.memoryExtractor,
    scope: state.memoryScope,
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    userMessage: state.input.message,
    assistantMessage: modelOutput.text,
    history: state.sanitizedHistory,
    toolResults: generation.toolResults,
    ...(state.input.conversationId !== undefined
      ? { conversationId: state.input.conversationId }
      : {}),
    ...(state.input.messageIds !== undefined ? { messageIds: state.input.messageIds } : {}),
  });
}
