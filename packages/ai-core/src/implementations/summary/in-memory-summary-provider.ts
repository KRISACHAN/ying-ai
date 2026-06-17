/**
 * 进程内会话摘要存储（开发/调试用）。
 *
 * 按 SummaryScope 键值存于 Map，重启丢失；demo 启用 summaryOptions 时使用。
 */
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

  /** 按 scope 从进程内 Map 读取摘要。 */
  public async load(input: SummaryLoadInput): Promise<SummaryLoadResult> {
    return { summary: this.summaries.get(scopeKey(input.scope)) ?? null };
  }

  /** 按 scope 写入进程内 Map。 */
  public async save(input: SummarySaveInput): Promise<SummarySaveResult> {
    this.summaries.set(scopeKey(input.scope), input.summary);

    return { summary: input.summary };
  }
}

/** 将 SummaryScope 序列化为 Map 键。 */
function scopeKey(scope: SummaryScope): string {
  return [scope.ownerType, scope.ownerId, scope.companionId ?? "", scope.conversationId ?? ""].join(
    ":",
  );
}
