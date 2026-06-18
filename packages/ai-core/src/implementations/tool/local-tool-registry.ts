import type {
  ToolDefinition,
  ToolExecuteInput,
  ToolHandler,
  ToolRegistry,
  ToolResult,
} from "../../abstractions/tool";

const TOOL_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

/** 本地工具注册表：注册、列出并执行宿主注入的本地工具。 */
export class LocalToolRegistry implements ToolRegistry {
  public readonly meta = {
    id: "tool.local-registry",
    kind: "tool",
    name: "Local Tool Registry",
  } as const;

  private readonly tools = new Map<string, RegisteredTool>();

  public register(definition: ToolDefinition, handler: ToolHandler): void {
    validateToolDefinition(definition);

    if (typeof handler !== "function") {
      throw new Error(`Tool handler is required: ${definition.name}`);
    }

    if (this.tools.has(definition.name)) {
      throw new Error(`Tool is already registered: ${definition.name}`);
    }

    this.tools.set(definition.name, { definition: cloneDefinition(definition), handler });
  }

  public async list(): Promise<ToolDefinition[]> {
    return Array.from(this.tools.values()).map((entry) => cloneDefinition(entry.definition));
  }

  public async execute(input: ToolExecuteInput): Promise<ToolResult> {
    const startedAt = new Date();
    const registered = this.tools.get(input.call.name);

    if (registered === undefined) {
      return {
        name: input.call.name,
        ...(input.call.id !== undefined ? { toolCallId: input.call.id } : {}),
        ok: false,
        result: null,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `Tool is not registered: ${input.call.name}`,
        },
        metadata: createMetadata(startedAt, new Date(), input.call.arguments),
      };
    }

    try {
      const result = await registered.handler(input);
      const endedAt = new Date();

      return {
        ...result,
        ...((result.toolCallId ?? input.call.id) !== undefined
          ? { toolCallId: result.toolCallId ?? input.call.id }
          : {}),
        name: result.name || input.call.name,
        ok: result.ok ?? true,
        metadata: {
          ...result.metadata,
          ...createMetadata(startedAt, endedAt, input.call.arguments),
        },
      };
    } catch (error) {
      const endedAt = new Date();

      return {
        name: input.call.name,
        ...(input.call.id !== undefined ? { toolCallId: input.call.id } : {}),
        ok: false,
        result: null,
        error: {
          code: "TOOL_EXECUTION_FAILED",
          message: toSafeMessage(error),
        },
        metadata: createMetadata(startedAt, endedAt, input.call.arguments),
      };
    }
  }
}

function validateToolDefinition(definition: ToolDefinition): void {
  if (typeof definition.name !== "string" || definition.name.trim() === "") {
    throw new Error("Tool name is required");
  }

  if (!TOOL_NAME_PATTERN.test(definition.name)) {
    throw new Error(`Tool name is invalid: ${definition.name}`);
  }

  if (typeof definition.description !== "string" || definition.description.trim() === "") {
    throw new Error(`Tool description is required: ${definition.name}`);
  }

  if (definition.parameters !== undefined && definition.parameters.type !== "object") {
    throw new Error(`Tool parameters must be an object schema: ${definition.name}`);
  }
}

function cloneDefinition(definition: ToolDefinition): ToolDefinition {
  return {
    ...definition,
    ...(definition.parameters !== undefined
      ? {
          parameters: {
            ...definition.parameters,
            ...(definition.parameters.properties !== undefined
              ? { properties: { ...definition.parameters.properties } }
              : {}),
            ...(definition.parameters.required !== undefined
              ? { required: [...definition.parameters.required] }
              : {}),
          },
        }
      : {}),
    ...(definition.metadata !== undefined ? { metadata: { ...definition.metadata } } : {}),
  };
}

function createMetadata(startedAt: Date, endedAt: Date, rawArguments: unknown) {
  return {
    startedAt,
    endedAt,
    durationMs: endedAt.getTime() - startedAt.getTime(),
    rawArguments,
  };
}

function toSafeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Tool execution failed";
}
