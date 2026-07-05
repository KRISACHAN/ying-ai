import Link from "next/link";
import { notFound } from "next/navigation";

import { ConversationWorkspace } from "../../conversation-workspace";
import { resolveWebSearchAvailabilityForModelConfig } from "../../lib/companion-runtime";
import { DebugRepository } from "../../lib/debug-repository";
import { inspectMemoryHealth } from "../../lib/memory-config";
import type { MemoryHealthView } from "../../lib/debug-types";
import { loadDefaultDebugModelConfig } from "../../lib/model-config";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = new DebugRepository();
  const detail = await repository.getConversationDetail(id);

  if (detail === null) {
    notFound();
  }

  const runs = await repository.listRuns(id);
  const latestRun = runs[0] !== undefined ? await repository.getRun(id, runs[0].id) : null;
  const health = await loadMemoryHealth();
  const defaultModelConfig = loadDefaultDebugModelConfig(process.env);
  const initialWebSearchAvailability = resolveWebSearchAvailabilityForModelConfig(
    process.env,
    defaultModelConfig,
  );

  return (
    <main className="conversation-shell">
      <header className="conversation-topbar">
        <div>
          <span>{detail.companion.name}</span>
          <h1>{detail.conversation.title}</h1>
        </div>
        <nav className="toolbar-actions">
          <Link href="/">返回列表</Link>
          <Link href={`/companions/${detail.companion.id}/edit`}>编辑伴侣</Link>
          <Link href={`/companions/${detail.companion.id}/memories`}>长期记忆</Link>
        </nav>
      </header>
      <ConversationWorkspace
        initialDetail={detail}
        initialRuns={runs}
        initialRun={latestRun}
        memoryHealth={health}
        defaultModelConfig={defaultModelConfig}
        initialWebSearchAvailability={initialWebSearchAvailability}
      />
    </main>
  );
}

async function loadMemoryHealth(): Promise<MemoryHealthView | null> {
  try {
    const runtime = await inspectMemoryHealth(process.env);

    return {
      status: runtime.status,
      reason: runtime.reason,
      provider: runtime.provider.meta,
      embeddingModel: runtime.embeddingModel,
      tableName: runtime.tableName,
      health: runtime.health,
    };
  } catch {
    return null;
  }
}
