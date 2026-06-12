import type { RecalledMemory } from "../../abstractions/memory";

export function formatMemoriesForPrompt(memories: RecalledMemory[]): string | undefined {
  if (memories.length === 0) {
    return undefined;
  }

  const lines = memories.map(
    (memory) => `- [${memory.type}][importance=${memory.importance}] ${memory.content}`,
  );

  return [
    "以下是你需要参考的长期上下文，请自然使用，不要机械复述：",
    "",
    ...lines,
    "",
    "长期上下文使用规则：",
    "1. 这些长期上下文只作为参考；",
    "2. 如果长期上下文和用户当前表达冲突，以用户当前表达为准；",
    "3. 不要说“根据我的记忆库”；",
    "4. 不要说“我查询到你的记忆”；",
    "5. 不要暴露内部系统存在；",
    "6. 自然地把相关信息融入回复；",
    "7. 无关记忆不要强行使用。",
  ].join("\n");
}
