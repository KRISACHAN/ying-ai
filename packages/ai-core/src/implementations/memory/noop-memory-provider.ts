/**
 * NoopMemoryProvider — 长期记忆空实现。
 *
 * createCompanionCore 未注入 memory 时的默认；recall 恒为空，save 全部记入 skipped。
 */
import type {
  MemoryProvider,
  MemoryRecallInput,
  MemoryRecallResult,
  MemorySaveInput,
  MemorySaveResult,
} from "../../abstractions/memory";

/** 长期记忆空实现：recall 返回空、save 全部跳过。 */
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
