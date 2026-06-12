import type {
  MemoryExtractionInput,
  MemoryExtractionResult,
  MemoryExtractor,
} from "../../abstractions/memory";

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
