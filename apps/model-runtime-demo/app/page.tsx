import Link from "next/link";

import { DebugRepository } from "./lib/debug-repository";
import { DeleteConversationButton, HomeActions } from "./home-actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    const repository = new DebugRepository();
    const [conversations, companions] = await Promise.all([
      repository.listConversations(),
      repository.listCompanions(),
    ]);

    return (
      <main className="shell shell-wide">
        <section className="panel panel-wide">
          <div className="page-toolbar">
            <div className="heading">
              <span>AI Companion Core Debug Workspace</span>
              <h1>会话历史</h1>
            </div>
            <div className="toolbar-actions">
              <Link className="secondary-button" href="/stories">
                Story Workbench
              </Link>
              <Link className="secondary-button" href="/debug/model-runtime">
                Model Runtime
              </Link>
              <Link className="secondary-button" href="/companions/new">
                新建伴侣
              </Link>
            </div>
          </div>

          <HomeActions companions={companions} />

          {conversations.length === 0 ? (
            <div className="empty-state">还没有对话，先创建一个伴侣开始吧。</div>
          ) : (
            <div className="conversation-list">
              {conversations.map((conversation) => (
                <article className="conversation-card" key={conversation.id}>
                  <Link href={`/conversations/${conversation.id}`}>
                    <span>{conversation.companionName}</span>
                    <h2>{conversation.title}</h2>
                    <p>{conversation.lastMessagePreview ?? "暂无消息"}</p>
                    <time>{formatDate(conversation.updatedAt)}</time>
                  </Link>
                  <div className="card-actions">
                    <Link href={`/companions/${conversation.companionId}/edit`}>编辑伴侣</Link>
                    <Link href={`/companions/${conversation.companionId}/memories`}>长期记忆</Link>
                    <DeleteConversationButton conversationId={conversation.id} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    );
  } catch (error) {
    return (
      <main className="shell">
        <section className="panel">
          <div className="heading">
            <span>Stage 8 Debug Workspace</span>
            <h1>需要初始化数据库</h1>
          </div>
          <p className="hint">
            {error instanceof Error ? error.message : "数据库不可用"}。请配置{" "}
            <code>DATABASE_URL</code> 并执行 demo migration。
          </p>
          <pre className="output">
            psql -d ying_companion_dev -f
            packages/memory-postgres/migrations/0001_create_companion_memories.sql
            {"\n"}
            psql -d ying_companion_dev -f
            apps/model-runtime-demo/migrations/0001_create_debug_workspace.sql
            {"\n"}
            psql -d ying_companion_dev -f
            apps/model-runtime-demo/migrations/0002_extend_debug_companion_persona.sql
          </pre>
        </section>
      </main>
    );
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
