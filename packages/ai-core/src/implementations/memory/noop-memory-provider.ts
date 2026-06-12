import type {
  MemoryProvider,
  MemoryRecallInput,
  MemoryRecallResult,
  MemorySaveInput,
  MemorySaveResult,
} from "../../abstractions/memory";

export class NoopMemoryProvider implements MemoryProvider {
  public readonly meta = {
    id: "memory.noop",
    kind: "memory",
    name: "Noop Memory Provider",
    description: "Disabled long-term memory; recall and save are no-ops",
    version: "1.0.0",
  } as const;

  public async recall(input: MemoryRecallInput): Promise<MemoryRecallResult> {
    void input;

    return { memories: [] };
  }

  public async save(input: MemorySaveInput): Promise<MemorySaveResult> {
    return { saved: [], skipped: input.memories };
  }
}
