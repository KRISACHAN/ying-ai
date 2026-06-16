import type {
  SummaryLoadResult,
  SummaryProvider,
  SummarySaveInput,
  SummarySaveResult,
} from "../../abstractions/summary";

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
