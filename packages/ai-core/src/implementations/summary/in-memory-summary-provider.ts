import type {
  ConversationSummary,
  SummaryLoadInput,
  SummaryLoadResult,
  SummaryProvider,
  SummarySaveInput,
  SummarySaveResult,
  SummaryScope,
} from "../../abstractions/summary";

export class InMemorySummaryProvider implements SummaryProvider {
  public readonly meta = {
    id: "summary.in-memory",
    kind: "summary",
    name: "In-memory Summary Provider",
    description: "Stores conversation summaries in process memory for local debugging",
    version: "1.0.0",
    capabilities: ["summary:load", "summary:save"],
  } as const;

  private readonly summaries = new Map<string, ConversationSummary>();

  public async load(input: SummaryLoadInput): Promise<SummaryLoadResult> {
    return { summary: this.summaries.get(scopeKey(input.scope)) ?? null };
  }

  public async save(input: SummarySaveInput): Promise<SummarySaveResult> {
    this.summaries.set(scopeKey(input.scope), input.summary);

    return { summary: input.summary };
  }
}

function scopeKey(scope: SummaryScope): string {
  return [scope.ownerType, scope.ownerId, scope.companionId ?? "", scope.conversationId ?? ""].join(
    ":",
  );
}
