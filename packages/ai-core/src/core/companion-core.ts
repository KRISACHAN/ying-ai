/**
 * CompanionCore 门面类。
 *
 * 对外暴露 inspect()（查看已挂载 Provider）与 executeWorkflow()（执行单轮聊天）。
 * context 在构造时冻结，防止运行期意外替换 Provider。
 */
import type {
  ChatWorkflowCoreContext,
  CompanionCoreContext,
  CompanionCoreProviderView,
} from "../abstractions/core-context";
import type { CoreProviderMeta } from "../abstractions/provider";
import type { ChatWorkflowInput, ChatWorkflowOutput } from "../abstractions/workflow";
import type {
  ChatWorkflowStreamEvent,
  SafeWorkflowError,
  SafeWorkflowErrorCode,
} from "../abstractions/workflow-stream";

/** core.inspect() 的返回结构：各 Provider 的 meta 快照。 */
export interface CompanionCoreInspection {
  providers: {
    model: CoreProviderMeta;
    persona: CoreProviderMeta;
    memory: CoreProviderMeta;
    memoryExtractor: CoreProviderMeta;
    summary: CoreProviderMeta;
    summaryUpdater: CoreProviderMeta;
    emotion: CoreProviderMeta;
    tools: CoreProviderMeta;
    safety: CoreProviderMeta;
    workflow: CoreProviderMeta;
    observer: CoreProviderMeta;
  };
}

export class CompanionCore {
  public readonly context: CompanionCoreProviderView;

  public constructor(context: CompanionCoreContext) {
    this.context = Object.freeze({ ...context });
  }

  /** 返回当前挂载的全部 Provider 只读视图。 */
  public getProviders(): CompanionCoreProviderView {
    return this.context;
  }

  /** 返回各 Provider 的 meta，供宿主调试面板展示依赖注入结果。 */
  public inspect(): CompanionCoreInspection {
    return {
      providers: {
        model: this.context.model.meta,
        persona: this.context.persona.meta,
        memory: this.context.memory.meta,
        memoryExtractor: this.context.memoryExtractor.meta,
        summary: this.context.summary.meta,
        summaryUpdater: this.context.summaryUpdater.meta,
        emotion: this.context.emotion.meta,
        tools: this.context.tools.meta,
        safety: this.context.safety.meta,
        workflow: this.context.workflow.meta,
        observer: this.context.observer.meta,
      },
    };
  }

  /** 委托当前挂载的 ChatWorkflow 执行单轮聊天。 */
  public async executeWorkflow(input: ChatWorkflowInput): Promise<ChatWorkflowOutput> {
    const { workflow, ...core } = this.context;

    return workflow.execute(input, {
      core: core satisfies ChatWorkflowCoreContext,
    });
  }

  /** 委托当前挂载的 ChatWorkflow 输出 Core 内部流事件。 */
  public async *streamWorkflow(input: ChatWorkflowInput): AsyncIterable<ChatWorkflowStreamEvent> {
    const { workflow, ...core } = this.context;

    if (workflow.stream === undefined) {
      const workflowId = createWorkflowId();

      yield {
        type: "workflow:start",
        workflowId,
        timestamp: new Date(),
      };
      yield {
        type: "workflow:error",
        workflowId,
        error: {
          code: "workflow_stream_not_supported",
          message: "The configured ChatWorkflow does not support streamWorkflow().",
          retryable: false,
        },
      };
      return;
    }

    let workflowId: string | undefined;
    let terminated = false;

    try {
      for await (const event of workflow.stream(input, {
        core: core satisfies ChatWorkflowCoreContext,
      })) {
        workflowId = event.workflowId;

        if (event.type === "workflow:finish" || event.type === "workflow:error") {
          terminated = true;
          yield event;
          break;
        }

        yield event;
      }
    } catch (error) {
      if (!terminated) {
        yield {
          type: "workflow:error",
          workflowId: workflowId ?? createWorkflowId(),
          error: toSafeWorkflowError(error),
        };
      }
    }
  }
}

function createWorkflowId(): string {
  return `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toSafeWorkflowError(error: unknown): SafeWorkflowError {
  const safeError = normalizeSafeWorkflowError(error);

  if (safeError !== null) {
    return safeError;
  }

  return {
    code: "workflow_failed",
    message: "Workflow stream failed.",
    retryable: false,
  };
}

function normalizeSafeWorkflowError(error: unknown): SafeWorkflowError | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const candidate = error as Partial<SafeWorkflowError>;

  if (!isSafeWorkflowErrorCode(candidate.code) || typeof candidate.message !== "string") {
    return null;
  }

  return {
    code: candidate.code,
    message: candidate.message,
    ...(candidate.retryable !== undefined ? { retryable: candidate.retryable } : {}),
    ...(candidate.step !== undefined ? { step: candidate.step } : {}),
    ...(candidate.details !== undefined ? { details: sanitizeSafeDetails(candidate.details) } : {}),
  };
}

function isSafeWorkflowErrorCode(code: unknown): code is SafeWorkflowErrorCode {
  return (
    code === "workflow_stream_not_supported" ||
    code === "input_safety_rejected" ||
    code === "output_safety_rejected" ||
    code === "model_stream_failed" ||
    code === "tool_planning_failed" ||
    code === "tool_execution_failed" ||
    code === "post_process_failed" ||
    code === "workflow_failed"
  );
}

function sanitizeSafeDetails(
  details: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => {
      return (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      );
    }),
  );
}
