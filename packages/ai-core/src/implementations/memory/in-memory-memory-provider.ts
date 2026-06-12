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

function sameScope(left: MemoryScope, right: MemoryScope): boolean {
  return (
    left.ownerType === right.ownerType &&
    left.ownerId === right.ownerId &&
    left.companionId === right.companionId
  );
}

function tokenize(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []));
}

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

function createMemoryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `memory_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
