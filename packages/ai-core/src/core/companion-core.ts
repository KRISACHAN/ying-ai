import type {
  ChatWorkflowCoreContext,
  CompanionCoreContext,
  CompanionCoreProviderView,
} from "../abstractions/core-context";
import type { CoreProviderMeta } from "../abstractions/provider";
import type { ChatWorkflowInput, ChatWorkflowOutput } from "../abstractions/workflow";

export interface CompanionCoreInspection {
  providers: {
    model: CoreProviderMeta;
    persona: CoreProviderMeta;
    memory: CoreProviderMeta;
    memoryExtractor: CoreProviderMeta;
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

  public getProviders(): CompanionCoreProviderView {
    return this.context;
  }

  public inspect(): CompanionCoreInspection {
    return {
      providers: {
        model: this.context.model.meta,
        persona: this.context.persona.meta,
        memory: this.context.memory.meta,
        memoryExtractor: this.context.memoryExtractor.meta,
        emotion: this.context.emotion.meta,
        tools: this.context.tools.meta,
        safety: this.context.safety.meta,
        workflow: this.context.workflow.meta,
        observer: this.context.observer.meta,
      },
    };
  }

  public async executeWorkflow(input: ChatWorkflowInput): Promise<ChatWorkflowOutput> {
    const { workflow, ...core } = this.context;

    return workflow.execute(input, {
      core: core satisfies ChatWorkflowCoreContext,
    });
  }
}
