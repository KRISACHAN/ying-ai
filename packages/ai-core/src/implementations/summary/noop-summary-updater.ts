/**
 * NoopSummaryUpdater — 会话摘要更新空实现。
 */
import type {
  ConversationSummary,
  SummaryUpdateInput,
  SummaryUpdateResult,
  SummaryUpdater,
} from "../../abstractions/summary";

/** 摘要更新器空实现：跳过压缩，返回 skipped。未注入 summary 时 createCompanionCore 的默认。 */
export class NoopSummaryUpdater implements SummaryUpdater {
  public readonly meta = {
    id: "summary-updater.noop",
    kind: "summary-updater",
    name: "Noop Summary Updater",
    description: "Disabled conversation summary updater",
    version: "1.0.0",
    capabilities: ["summary:update:disabled"],
  } as const;

  public async update(input: SummaryUpdateInput): Promise<SummaryUpdateResult> {
    const summary: ConversationSummary = input.currentSummary ?? {
      scope: input.scope,
      content: "",
      messageCount: 0,
      updatedAt: new Date(),
      metadata: { skipped: true, reason: "provider_noop" },
    };

    return {
      summary,
      summarizedMessageCount: 0,
      skipped: true,
      reason: "provider_noop",
    };
  }
}
