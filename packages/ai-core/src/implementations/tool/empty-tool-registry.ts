/**
 * EmptyToolRegistry — 默认空工具注册表。
 */
import type {
  ToolDefinition,
  ToolExecuteInput,
  ToolHandler,
  ToolRegistry,
  ToolResult,
} from "../../abstractions/tool";

/** 未注入工具能力时的占位实现：list 为空，注册与执行均受控失败。 */
export class EmptyToolRegistry implements ToolRegistry {
  public readonly meta = {
    id: "tool.empty-registry",
    kind: "tool",
    name: "Empty Tool Registry",
  } as const;

  public async list(): Promise<ToolDefinition[]> {
    return [];
  }

  public async execute(input: ToolExecuteInput): Promise<ToolResult> {
    throw new Error(`Tool is not registered: ${input.call.name}`);
  }

  public register(definition: ToolDefinition, handler: ToolHandler): void {
    void definition;
    void handler;

    throw new Error("Tool registry is disabled");
  }
}
