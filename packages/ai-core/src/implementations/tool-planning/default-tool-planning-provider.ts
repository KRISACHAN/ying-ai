import { ModelCapabilityUnavailableError } from "../../errors/model-capability-unavailable-error";
import type { ChatModel, ModelToolCall } from "../../abstractions/model";
import type {
  ToolPlan,
  ToolPlanningInput,
  ToolPlanningProvider,
} from "../../abstractions/tool-planning";

const PLANNER_SYSTEM_PROMPT = [
  "你现在是工具规划器，不是聊天回复器。",
  "只有确有必要时才调用工具。",
  "不需要工具时不要回答用户，不要写解释。",
  "工具调用参数必须符合工具定义。",
  "伴侣最终自然语言回复由后续阶段单独生成。",
].join("\n");

export interface DefaultToolPlanningProviderOptions {
  /**
   * @deprecated Stage 4 planning passes the current request model via plan(input.model).
   */
  model: ChatModel;
}

export class DefaultToolPlanningProvider implements ToolPlanningProvider {
  public readonly meta = {
    id: "tool-planning.default",
    kind: "tool-planning",
    name: "Default Tool Planning Provider",
  } as const;

  public constructor(options?: DefaultToolPlanningProviderOptions) {
    void options;
  }

  public async plan(input: ToolPlanningInput): Promise<ToolPlan> {
    if (Object.keys(input.tools).length === 0) {
      return { type: "no_tool", reason: "no_tools" };
    }

    try {
      const output = await input.model.generate({
        messages: [{ role: "system", content: PLANNER_SYSTEM_PROMPT }, ...input.messages],
        tools: input.tools,
        requiredCapabilities: { toolCalling: true },
      });
      const calls = normalizeToolCalls(output.toolCalls);

      if (calls === null) {
        return {
          type: "no_tool",
          reason: "invalid_plan",
          ...(output.runtime !== undefined ? { runtime: output.runtime } : {}),
        };
      }

      if (calls.length === 0) {
        return {
          type: "no_tool",
          ...(output.runtime !== undefined ? { runtime: output.runtime } : {}),
        };
      }

      return {
        type: "tool_calls",
        calls,
        ...(output.runtime !== undefined ? { runtime: output.runtime } : {}),
      };
    } catch (error) {
      if (error instanceof ModelCapabilityUnavailableError) {
        return {
          type: "no_tool",
          reason: "tool_calling_unavailable",
          runtime: {
            usedModel: "",
            fallbackUsed: false,
            primaryAttempts: 0,
            fallbackAttempts: 0,
            errors: [],
            capabilitySkips: error.capabilitySkips,
          },
        };
      }

      return { type: "no_tool", reason: "planner_unavailable" };
    }
  }
}

function normalizeToolCalls(toolCalls: ModelToolCall[] | undefined): ModelToolCall[] | null {
  if (toolCalls === undefined) {
    return [];
  }

  for (const toolCall of toolCalls) {
    if (toolCall.name.trim() === "") {
      return null;
    }
  }

  return toolCalls;
}
