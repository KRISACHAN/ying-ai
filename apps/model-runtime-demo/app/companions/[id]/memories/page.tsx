import Link from "next/link";
import { notFound } from "next/navigation";

import { DebugRepository } from "../../../lib/debug-repository";
import type { MemoryRecord } from "@ying-ai/ai-core";
import {
  CompanionMemoryAdminRepository,
  createCompanionMemoryScope,
} from "../../../lib/memory-admin-repository";
import { MemoryManager } from "../../../memory-manager";

export const dynamic = "force-dynamic";

export default async function CompanionMemoriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const debugRepository = new DebugRepository();
  const companion = await debugRepository.getCompanion(id);

  if (companion === null) {
    notFound();
  }

  let memories: MemoryRecord[] = [];
  let error: string | null = null;

  try {
    const memoryRepository = new CompanionMemoryAdminRepository();
    memories = await memoryRepository.list(createCompanionMemoryScope(id));
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "加载长期记忆失败";
  }

  return (
    <main className="shell shell-wide">
      <section className="panel panel-wide">
        <div className="page-toolbar">
          <div className="heading">
            <span>{companion.name}</span>
            <h1>长期记忆管理</h1>
          </div>
          <div className="toolbar-actions">
            <Link className="secondary-button" href="/">
              返回列表
            </Link>
            <Link className="secondary-button" href={`/companions/${id}/edit`}>
              编辑伴侣
            </Link>
          </div>
        </div>
        {error !== null ? <p className="form-error">{error}</p> : null}
        <MemoryManager companionId={id} initialMemories={memories} />
      </section>
    </main>
  );
}
