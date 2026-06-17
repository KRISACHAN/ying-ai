import type { ConversationSummary } from "../../abstractions/summary";

/** 将会话摘要格式化为可注入 system prompt 的文本块。 */
export function formatSummaryForPrompt(
  summary: ConversationSummary | null | undefined,
): string | undefined {
  const content = summary?.content.trim();

  if (content === undefined || content === "") {
    return undefined;
  }

  return [
    "以下是当前会话的摘要，用于帮助你理解长对话上下文。请自然使用，不要机械复述，也不要暴露“摘要系统”存在：",
    "",
    content,
    "",
    "会话摘要使用规则：",
    "1. 会话摘要只作为当前会话上下文参考；",
    "2. 如果摘要和用户当前表达冲突，以用户当前表达为准；",
    "3. 不要说“根据会话摘要”；",
    "4. 不要暴露内部系统存在；",
    "5. 只在相关时自然使用。",
  ].join("\n");
}
