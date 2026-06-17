/**
 * 进程内长期记忆实现（开发/调试用）。
 *
 * recall 使用简单关键词匹配打分（非真实向量）；save 去重后存入内存数组，进程重启即丢失。
 * 生产持久化请使用 @ying-companion/memory-postgres 并注入 Core。
 */
import type {
  ExtractedMemory,
  MemoryProvider,
  MemoryRecallInput,
  MemoryRecallResult,
  MemoryRecord,
  MemorySaveInput,
  MemorySaveResult,
  MemoryScope,
} from "../../abstractions/memory";

export class InMemoryMemoryProvider implements MemoryProvider {
  public readonly meta = {
    id: "memory.in-memory",
    kind: "memory",
    name: "In-Memory Memory Provider",
    description: "Process-local long-term memory for development and workflow validation",
    version: "1.0.0",
  } as const;

  private readonly records: MemoryRecord[] = [];

  /** 关键词匹配 recall（非向量）；按 score 与 importance 排序取 TopK。 */
  public async recall(input: MemoryRecallInput): Promise<MemoryRecallResult> {
    const limit = input.limit ?? 5;
    const minImportance = input.minImportance ?? 3;
    const terms = tokenize(input.query);

    const memories = this.records
      .filter((record) => sameScope(record.scope, input.scope))
      .filter((record) => record.importance >= minImportance)
      .map((record) => ({ record, score: scoreMemory(record.content, terms, input.query) }))
      .filter((item) => item.score > 0 || terms.length === 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return right.record.importance - left.record.importance;
      })
      .slice(0, limit)
      .map(({ record, score }) => ({
        ...record,
        ...(score > 0 ? { score } : {}),
      }));

    return { memories };
  }

  /** 写入进程内数组；importance < 3 与同 scope 重复内容跳过。 */
  public async save(input: MemorySaveInput): Promise<MemorySaveResult> {
    const saved: MemoryRecord[] = [];
    const skipped: ExtractedMemory[] = [];
    const now = new Date();

    for (const memory of input.memories) {
      if (memory.importance < 3) {
        skipped.push(memory);
        continue;
      }

      const duplicate = this.records.some(
        (record) =>
          sameScope(record.scope, input.scope) &&
          record.type === memory.type &&
          record.content === memory.content,
      );

      if (duplicate) {
        skipped.push(memory);
        continue;
      }

      const record: MemoryRecord = {
        id: createMemoryId(),
        scope: input.scope,
        type: memory.type,
        content: memory.content,
        importance: memory.importance,
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(memory.metadata !== undefined ? { metadata: memory.metadata } : {}),
        createdAt: now,
        updatedAt: now,
      };

      this.records.push(record);
      saved.push(record);
    }

    return { saved, skipped };
  }
}

/** 判断两条记忆是否属于同一隔离 scope。 */
function sameScope(left: MemoryScope, right: MemoryScope): boolean {
  return (
    left.ownerType === right.ownerType &&
    left.ownerId === right.ownerId &&
    left.companionId === right.companionId
  );
}

/** 将 query 拆为去重词元，用于简单关键词打分。 */
function tokenize(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []));
}

/** 基于子串包含与词元命中率计算 0–1 的相似度分数。 */
function scoreMemory(content: string, terms: string[], query: string): number {
  const normalizedContent = content.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  if (normalizedContent.includes(normalizedQuery)) {
    return 1;
  }

  if (terms.length === 0) {
    return 0.1;
  }

  const matched = terms.filter((term) => normalizedContent.includes(term)).length;

  return matched / terms.length;
}

/** 生成记忆 ID；优先使用 crypto.randomUUID。 */
function createMemoryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `memory_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
