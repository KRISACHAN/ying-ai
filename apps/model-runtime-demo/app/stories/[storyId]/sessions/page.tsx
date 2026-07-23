import Link from "next/link";
import { notFound } from "next/navigation";

import { StoryDebugRepository } from "../../../lib/story-debug-repository";
import { CreateStorySessionButton } from "../../story-actions";

export const dynamic = "force-dynamic";

export default async function StorySessionsPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const repository = new StoryDebugRepository();
  const [story, sessions] = await Promise.all([
    repository.getStory(storyId),
    repository.listSessions(storyId),
  ]);

  if (story === null) {
    notFound();
  }

  return (
    <main className="shell shell-wide">
      <section className="panel panel-wide">
        <div className="page-toolbar">
          <div className="heading">
            <span>
              {story.id} · v{story.version}
            </span>
            <h1>{story.title}</h1>
          </div>
          <nav className="toolbar-actions">
            <Link className="secondary-button" href="/stories">
              返回故事列表
            </Link>
            <CreateStorySessionButton storyId={story.id} />
          </nav>
        </div>

        <section className="debug-section">
          <h3>Definition Preview</h3>
          <p className="hint">{story.premise}</p>
          <div className="story-preview-grid">
            <PreviewBlock title="角色" items={story.characters.map((item) => item.name)} />
            <PreviewBlock title="场景" items={story.scenes.map((item) => item.title)} />
            <PreviewBlock title="属性" items={story.attributes.map((item) => item.label)} />
          </div>
        </section>

        {sessions.length === 0 ? (
          <div className="empty-state">还没有存档。创建一个 Story Session 开始游玩。</div>
        ) : (
          <div className="conversation-list">
            {sessions.map((session) => (
              <article className="conversation-card" key={session.id}>
                <Link href={`/stories/${story.id}/sessions/${session.id}`}>
                  <span>
                    {session.storyTitle} · revision {session.stateRevision} · definition{" "}
                    {session.definitionVersion}
                  </span>
                  <h2>{session.currentSceneTitle}</h2>
                  <p>{session.id}</p>
                  <time>{formatDate(session.updatedAt)}</time>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function PreviewBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="story-preview-block">
      <strong>{title}</strong>
      <span>{items.join(" / ") || "无"}</span>
    </div>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
