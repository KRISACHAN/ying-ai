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
}
