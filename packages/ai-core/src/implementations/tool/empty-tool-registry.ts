/**
 * EmptyToolRegistry — 工具注册表占位实现（阶段 6 前）。
 */
import type {
  ToolDefinition,
  ToolExecuteInput,
  ToolHandler,
  ToolRegistry,
  ToolResult,
} from "../../abstractions/tool";

/** 工具注册表占位实现（阶段 6 前禁止注册与执行）。 */
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
