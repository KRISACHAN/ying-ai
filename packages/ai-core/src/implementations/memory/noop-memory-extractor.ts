/**
 * NoopMemoryExtractor — 记忆抽取空实现。
 */
import type {
  MemoryExtractionInput,
  MemoryExtractionResult,
  MemoryExtractor,
} from "../../abstractions/memory";

/** 记忆抽取空实现：始终返回空数组。未注入 memory 时 createCompanionCore 的默认 extractor。 */
export class NoopMemoryExtractor implements MemoryExtractor {
  public readonly meta = {
    id: "memory-extractor.noop",
    kind: "memory-extractor",
    name: "Noop Memory Extractor",
    description: "Disabled memory extraction",
    version: "1.0.0",
  } as const;

  public async extract(input: MemoryExtractionInput): Promise<MemoryExtractionResult> {
    void input;

    return { memories: [] };
  }
}
