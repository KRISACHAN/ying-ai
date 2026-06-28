import type { ChatWorkflowDebugContext, ChatWorkflowOutput } from "../../abstractions/workflow";
import { requireStateValue, type WorkflowExecutionState } from "./workflow-execution-state";

export function buildWorkflowOutput(state: WorkflowExecutionState): ChatWorkflowOutput {
  const prompt = requireStateValue(state.prompt, "prompt");
  const generation = requireStateValue(state.generation, "generation");
  const emotion = requireStateValue(state.emotion, "emotion");
  const recall = requireStateValue(state.recall, "recall");
  const inputSafety = requireStateValue(state.inputSafety, "inputSafety");
  const outputSafety = requireStateValue(state.outputSafety, "outputSafety");
  const summaryResult = requireStateValue(state.summaryResult, "summaryResult");
  const memoryResult = requireStateValue(state.memoryResult, "memoryResult");
  const modelOutput = generation.finalOutput;
  const embeddingVectorLength = recall.embeddingVectorLength ?? memoryResult.embeddingVectorLength;
  const debugContext: ChatWorkflowDebugContext = {
    scope: state.memoryScope,
    ...(prompt.memoryContext !== undefined ? { memoryContext: prompt.memoryContext } : {}),
    ...(prompt.summaryContext !== undefined ? { summaryContext: prompt.summaryContext } : {}),
    ...(prompt.emotionContext !== undefined ? { emotionContext: prompt.emotionContext } : {}),
    previousEmotion: emotion.previous,
    ...(emotion.detected !== undefined ? { detectedEmotion: emotion.detected } : {}),
    nextEmotion: emotion.next,
    recentHistory: state.recentHistory,
    summarizedMessages: summaryResult.summarizedMessages,
    personaPrompt: prompt.personaPrompt,
    systemPrompt: prompt.systemPrompt,
    messages: prompt.messages,
    toolDefinitions: state.toolDefinitions,
    toolCalls: generation.toolCalls,
    toolResults: generation.toolResults,
    ...(generation.droppedToolCalls.length > 0
      ? { droppedToolCalls: generation.droppedToolCalls }
      : {}),
    ...(generation.followUpMessages !== undefined
      ? { toolFollowUpMessages: generation.followUpMessages }
      : {}),
    ...(embeddingVectorLength !== undefined ? { embeddingVectorLength } : {}),
  };
  const toolPlanning = state.toolPlanning;

  if (toolPlanning !== undefined) {
    debugContext.toolPlan = toolPlanning.plan;

    if (toolPlanning.reason !== undefined) {
      debugContext.toolPlanningReason = toolPlanning.reason;
    }

    if (toolPlanning.plannerUnavailableSource !== undefined) {
      debugContext.plannerUnavailableSource = toolPlanning.plannerUnavailableSource;
    }

    if (toolPlanning.runtime !== undefined) {
      debugContext.toolPlanningRuntime = toolPlanning.runtime;
    }
  }

  const trace = state.recorder.snapshot();

  return {
    text: modelOutput.text,
    model: modelOutput.model,
    raw: modelOutput.raw,
    persona: prompt.persona,
    memories: recall.memories,
    emotion: emotion.next,
    toolResults: generation.toolResults,
    safety: { input: inputSafety, output: outputSafety },
    metadata: {
      historyCount: state.sanitizedHistory.length,
      messageCount: prompt.messages.length,
      toolDefinitions: state.toolDefinitions,
      toolCalls: generation.toolCalls,
      droppedToolCalls: generation.droppedToolCalls,
      toolCallsDropped: generation.toolCallsDropped,
      toolRounds: generation.rounds,
      toolFollowUpGenerated: generation.followUpGenerated,
      ...(toolPlanning !== undefined
        ? {
            toolPlan: toolPlanning.plan,
            ...(toolPlanning.reason !== undefined
              ? { toolPlanningReason: toolPlanning.reason }
              : {}),
            ...(toolPlanning.plannerUnavailableSource !== undefined
              ? { plannerUnavailableSource: toolPlanning.plannerUnavailableSource }
              : {}),
            ...(toolPlanning.runtime !== undefined
              ? { toolPlanningRuntime: toolPlanning.runtime }
              : {}),
          }
        : {}),
      extractedMemories: memoryResult.extracted,
      savedMemories: memoryResult.saved,
      skippedMemories: memoryResult.skipped,
      debugContext,
      summary: state.summary ?? null,
      updatedSummary: summaryResult.updatedSummary,
      summarySkipped: summaryResult.skipped,
      summarySkipReason: summaryResult.reason,
      ...(state.input.workflowOptions?.includeTrace === true ? { trace } : {}),
    },
    modelOutput,
  };
}
