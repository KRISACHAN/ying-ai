import type { ChatMessage, ModelRuntimeInfo, ModelToolCall } from "./model";
import type { CoreProvider } from "./provider";

export interface ToolPlanningInput {
  messages: ChatMessage[];
  tools: Record<string, unknown>;
  model?: string;
}

export type ToolPlanningDegradationReason =
  | "no_tools"
  | "tool_calling_unavailable"
  | "planner_unavailable"
  | "invalid_plan";

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
  plan(input: ToolPlanningInput): Promise<ToolPlan>;
}
