import type {
  ChatWorkflow,
  ChatWorkflowExecutionContext,
  ChatWorkflowInput,
  ChatWorkflowOutput,
} from "../../abstractions/workflow";

export class DisabledChatWorkflow implements ChatWorkflow {
  public readonly meta = {
    id: "workflow.disabled",
    kind: "workflow",
    name: "Disabled Chat Workflow",
  } as const;

  public async execute(
    input: ChatWorkflowInput,
    context: ChatWorkflowExecutionContext,
  ): Promise<ChatWorkflowOutput> {
    void input;
    void context;

    throw new Error("ChatWorkflow is disabled");
  }
}
