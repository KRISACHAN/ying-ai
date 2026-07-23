import Link from "next/link";

import { StoryDebugRepository } from "../lib/story-debug-repository";
import { StoryImportPanel } from "./story-actions";

export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  try {
    const repository = new StoryDebugRepository();
    const stories = await repository.listStories();

    return (
      <main className="shell shell-wide">
        <section className="panel panel-wide">
          <div className="page-toolbar">
            <div className="heading">
              <span>Story Mode Workbench</span>
              <h1>故事列表</h1>
            </div>
            <nav className="toolbar-actions">
              <Link className="secondary-button" href="/">
                Companion Workbench
              </Link>
            </nav>
          </div>

          <StoryImportPanel />

          <div className="conversation-list">
            {stories.map((story) => (
              <article className="conversation-card" key={story.id}>
                <Link href={`/stories/${story.id}/sessions`}>
                  <span>
                    {story.id} · v{story.version}
                  </span>
                  <h2>{story.title}</h2>
                  <p>{story.description}</p>
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  } catch (error) {
    return (
      <main className="shell">
        <section className="panel">
          <div className="heading">
            <span>Story Mode Workbench</span>
            <h1>需要初始化数据库</h1>
          </div>
          <p className="hint">
            {error instanceof Error ? error.message : "数据库不可用"}。请配置{" "}
            <code>DATABASE_URL</code>；Story migration 会由 Workbench 自动执行。
          </p>
        </section>
      </main>
    );
  }
}
