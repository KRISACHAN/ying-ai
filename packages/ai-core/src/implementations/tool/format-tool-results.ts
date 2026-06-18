import type { ToolResult } from "../../abstractions/tool";

/** 将 ToolResult 序列化为模型可读、无堆栈的 tool role content；返回值不是 ToolResult 结构。 */
export function formatToolResultForModel(result: ToolResult): string {
  if (result.ok === false) {
    return safeJsonStringify({
      ok: false,
      error: result.error?.code ?? "TOOL_EXECUTION_FAILED",
      message: result.error?.message ?? "Tool execution failed",
    });
  }

  return safeJsonStringify({
    ok: true,
    result: result.result,
  });
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({
      ok: false,
      error: "TOOL_EXECUTION_FAILED",
      message: "Unserializable tool result",
    });
  }
}
