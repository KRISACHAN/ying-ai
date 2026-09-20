/**
 * ToolPlan 的顺序执行边界。
 *
 * 每个调用在 text:delta 之前依次发出 tool:call / tool:result。参数 JSON 无效或 Registry
 * 返回 ok=false 属于受控工具失败，步骤以 degraded 完成并把结果交给最终模型；自定义
 * Registry 直接抛出的异常属于未受控失败，会转换为 tool_execution_failed 并终止工作流。
 */
import type { ModelToolCall } from "../../abstractions/model";
import type { CoreObserver } from "../../abstractions/observer";
import type { ToolResult } from "../../abstractions/tool";
import type { ChatWorkflowExecutionContext } from "../../abstractions/workflow";
import { toCoreToolCall } from "../tool/tool-adapter";
import { createSafeWorkflowError, toSafeMessage } from "./workflow-safe-error";
import type { WorkflowStreamEmitter } from "./workflow-stream-emitter";
import { runWorkflowStep, safeEmit } from "./workflow-step-runner";
import type { WorkflowTraceRecorder } from "./workflow-trace-recorder";

export interface ExecuteToolCallsOptions {
  observer: CoreObserver;
  recorder: WorkflowTraceRecorder;
  streamEmitter?: WorkflowStreamEmitter | undefined;
  tools: ChatWorkflowExecutionContext["core"]["tools"];
  toolCalls: ModelToolCall[];
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/** 按规划顺序执行工具并保持结果顺序与 toolCalls 一致。 */
export async function executeToolCalls(options: ExecuteToolCallsOptions): Promise<ToolResult[]> {
  return runWorkflowStep({
    observer: options.observer,
    recorder: options.recorder,
    streamEmitter: options.streamEmitter,
    workflowStep: "tool:execute",
    legacyStep: "tool:execute",
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    run: async () => {
      const results: ToolResult[] = [];

      for (const modelToolCall of options.toolCalls) {
        const coreCall = toCoreToolCall(modelToolCall);
        options.streamEmitter?.emitToolCall(modelToolCall);

        await safeEmit(options.observer, {
          type: "tool:execute:start",
          timestamp: new Date(),
          payload: {
            sessionId: options.sessionId,
            toolCallId: coreCall.id,
            name: coreCall.name,
            arguments: coreCall.arguments,
          },
        });

        let result: ToolResult;

        if (hasInvalidJsonArguments(modelToolCall, coreCall)) {
          result = createInvalidArgumentsResult(modelToolCall);
        } else {
          try {
            result = await options.tools.execute({
              call: coreCall,
              ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
              ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
            });
          } catch (error) {
            result = createToolExecutionFailedResult(modelToolCall, error);

            await safeEmit(options.observer, {
              type: "tool:execute:end",
              timestamp: new Date(),
              payload: {
                sessionId: options.sessionId,
                toolCallId: result.toolCallId,
                name: result.name,
                ok: false,
                result: result.result,
                error: result.error,
              },
            });

            options.streamEmitter?.emitToolResult(result);

            throw createSafeWorkflowError({
              code: "tool_execution_failed",
              step: "tool:execute",
              message: "Tool execution failed.",
              details: { reason: toSafeMessage(error) },
            });
          }
        }

        await safeEmit(options.observer, {
          type: "tool:execute:end",
          timestamp: new Date(),
          payload: {
            sessionId: options.sessionId,
            toolCallId: result.toolCallId,
            name: result.name,
            ok: result.ok ?? true,
            result: result.result,
            error: result.error,
            durationMs: result.metadata?.durationMs,
          },
        });

        options.streamEmitter?.emitToolResult(result);
        results.push(result);
      }

      return results;
    },
    status: (results) => (results.some((result) => result.ok === false) ? "degraded" : "success"),
    summarize: (results) => ({
      requestedCount: options.toolCalls.length,
      resultCount: results.length,
      failedCount: results.filter((result) => result.ok === false).length,
    }),
  });
}

function hasInvalidJsonArguments(
  modelToolCall: ModelToolCall,
  coreCall: { arguments: unknown },
): boolean {
  return (
    typeof modelToolCall.arguments === "string" &&
    modelToolCall.arguments.trim() !== "" &&
    coreCall.arguments === modelToolCall.arguments
  );
}

function createInvalidArgumentsResult(modelToolCall: ModelToolCall): ToolResult {
  return {
    name: modelToolCall.name,
    ...(modelToolCall.id !== undefined ? { toolCallId: modelToolCall.id } : {}),
    ok: false,
    result: null,
    error: {
      code: "TOOL_INVALID_ARGUMENTS",
      message: `Tool arguments are not valid JSON: ${modelToolCall.name}`,
    },
    metadata: {
      rawArguments: modelToolCall.arguments,
    },
  };
}

function createToolExecutionFailedResult(modelToolCall: ModelToolCall, error: unknown): ToolResult {
  return {
    name: modelToolCall.name,
    ...(modelToolCall.id !== undefined ? { toolCallId: modelToolCall.id } : {}),
    ok: false,
    result: null,
    error: {
      code: "TOOL_EXECUTION_FAILED",
      message: toSafeMessage(error),
    },
  };
}
