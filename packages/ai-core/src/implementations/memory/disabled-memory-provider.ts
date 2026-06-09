import type {
  Memory,
  MemoryProvider,
  MemoryRecallInput,
  MemorySaveInput,
} from "../../abstractions/memory";

export class DisabledMemoryProvider implements MemoryProvider {
  public readonly meta = {
    id: "memory.disabled",
    kind: "memory",
    name: "Disabled Memory Provider",
  } as const;

  public async recall(input: MemoryRecallInput): Promise<Memory[]> {
    void input;

    return [];
  }

  public async save(input: MemorySaveInput): Promise<void> {
    void input;
    // noop
  }
}
