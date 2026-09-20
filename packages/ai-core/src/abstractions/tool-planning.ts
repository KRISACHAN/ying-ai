/**
 * 工具规划契约。
 *
 * 规划只决定是否调用工具及调用参数，不生成用户可见回复；最终自然语言回答由
 * Workflow 在工具执行完成后单独生成。能力不足或规划不可用时以 no_tool + reason
 * 显式降级，避免 Workflow 根据具体 Provider 名称分支。
 */
import type { ChatMessage, ChatModel, ModelRuntimeInfo, ModelToolCall } from "./model";
import type { CoreProvider } from "./provider";

export interface ToolPlanningInput {
  model: ChatModel;
  messages: ChatMessage[];
  tools: Record<string, unknown>;
}

export type ToolPlanningDegradationReason =
  | "no_tools"
  | "tool_calling_unavailable"
  | "planner_unavailable"
  | "invalid_plan";

/**
 * 规划结果的判别联合。no_tool 不一定表示降级：模型判断无需工具时可不带 reason；
 * reason 只解释无工具、能力不足、规划器不可用或结果无效等可观测原因。
 */
export type ToolPlan =
  | {
      type: "no_tool";
      reason?: ToolPlanningDegradationReason;
      runtime?: ModelRuntimeInfo;
    }
  | {
      type: "tool_calls";
      calls: ModelToolCall[];
      runtime?: ModelRuntimeInfo;
    };

export interface ToolPlanningProvider extends CoreProvider {
  /** 使用本次请求的 model 进行规划，避免在 Provider 构造期绑定固定模型候选。 */
  plan(input: ToolPlanningInput): Promise<ToolPlan>;
}
