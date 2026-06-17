/**
 * DisabledChatWorkflow — 显式禁用聊天工作流时的占位实现。
 */
import type {
  ChatWorkflow,
  ChatWorkflowExecutionContext,
  ChatWorkflowInput,
  ChatWorkflowOutput,
} from "../../abstractions/workflow";

/** 显式禁用 Workflow 时的占位实现，execute 直接抛错。 */
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
