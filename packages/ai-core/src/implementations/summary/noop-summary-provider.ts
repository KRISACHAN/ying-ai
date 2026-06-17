/**
 * NoopSummaryProvider — 会话摘要存储空实现。
 */
import type {
  SummaryLoadResult,
  SummaryProvider,
  SummarySaveInput,
  SummarySaveResult,
} from "../../abstractions/summary";

/** 摘要 Provider 空实现：load 恒为 null，save 透传但不持久化。 */
export class NoopSummaryProvider implements SummaryProvider {
  public readonly meta = {
    id: "summary.noop",
    kind: "summary",
    name: "Noop Summary Provider",
    description: "Disabled conversation summary provider",
    version: "1.0.0",
    capabilities: ["summary:disabled"],
  } as const;

  public async load(): Promise<SummaryLoadResult> {
    return { summary: null };
  }

  public async save(input: SummarySaveInput): Promise<SummarySaveResult> {
    return { summary: input.summary };
  }
}
