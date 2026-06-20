import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanionForm } from "../../../companion-form";
import { DebugRepository } from "../../../lib/debug-repository";

export const dynamic = "force-dynamic";

export default async function EditCompanionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = new DebugRepository();
  const companion = await repository.getCompanion(id);

  if (companion === null) {
    notFound();
  }

  return (
    <main className="shell">
      <section className="panel">
        <div className="page-toolbar">
          <div className="heading">
            <span>Persona</span>
            <h1>编辑伴侣</h1>
          </div>
          <div className="toolbar-actions">
            <Link className="secondary-button" href={`/companions/${id}/memories`}>
              长期记忆
            </Link>
            <Link className="secondary-button" href="/">
              返回列表
            </Link>
          </div>
        </div>
        <CompanionForm companion={companion} />
      </section>
    </main>
  );
}
