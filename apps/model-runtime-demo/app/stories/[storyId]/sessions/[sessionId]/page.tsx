import Link from "next/link";
import { notFound } from "next/navigation";

import {
  StoryRuntimeWorkspace,
  type StoryRuntimeInitialDetail,
} from "../../../../story-runtime-workspace";
import { StoryDebugRepository } from "../../../../lib/story-debug-repository";

export const dynamic = "force-dynamic";

export default async function StoryRuntimePage({
  params,
}: {
  params: Promise<{ storyId: string; sessionId: string }>;
}) {
  const { storyId, sessionId } = await params;
  const repository = new StoryDebugRepository();
  const detail = await repository.getSessionDetail(sessionId);

  if (detail === null || detail.session.storyId !== storyId) {
    notFound();
  }

  return (
    <main className="conversation-shell story-runtime-shell">
      <header className="conversation-topbar">
        <div>
          <span>
            {detail.session.storyId} · definition {detail.session.definitionVersion} · revision{" "}
            {detail.state.revision}
          </span>
          <h1>{detail.definition.title}</h1>
        </div>
        <nav className="toolbar-actions">
          <Link href={`/stories/${storyId}/sessions`}>返回存档</Link>
          <Link href="/stories">故事列表</Link>
        </nav>
      </header>
      <StoryRuntimeWorkspace initialDetail={detail as StoryRuntimeInitialDetail} />
    </main>
  );
}
