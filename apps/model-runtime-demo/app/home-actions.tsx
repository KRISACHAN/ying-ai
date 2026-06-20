"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DebugCompanion } from "./lib/debug-types";

export function HomeActions({ companions }: { companions: DebugCompanion[] }) {
  const router = useRouter();
  const [companionId, setCompanionId] = useState(companions[0]?.id ?? "");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createConversation() {
    if (companionId === "" || isCreating) {
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companionId }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        conversation?: { id: string };
        error?: { message: string };
      };

      if (!body.ok || body.conversation === undefined) {
        setError(body.error?.message ?? "创建会话失败");
        return;
      }

      router.push(`/conversations/${body.conversation.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建会话失败");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="start-panel">
      {companions.length === 0 ? (
        <p className="hint">当前没有伴侣配置。先新建伴侣，再创建对话。</p>
      ) : (
        <>
          <label className="scope-field">
            <span>选择伴侣创建新对话</span>
            <select
              className="scope-input"
              value={companionId}
              disabled={isCreating}
              onChange={(event) => setCompanionId(event.target.value)}
            >
              {companions.map((companion) => (
                <option key={companion.id} value={companion.id}>
                  {companion.name} · {companion.gender}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            type="button"
            disabled={isCreating}
            onClick={createConversation}
          >
            {isCreating ? "创建中" : "新建对话"}
          </button>
        </>
      )}
      {error !== null ? <p className="form-error">{error}</p> : null}
    </div>
  );
}

export function DeleteConversationButton({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm("确认删除这个会话？长期记忆不会被删除。")) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message: string } };
        setError(body.error?.message ?? "删除失败");
        return;
      }

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <button className="link-button danger" type="button" disabled={isDeleting} onClick={remove}>
        {isDeleting ? "删除中" : "删除会话"}
      </button>
      {error !== null ? <span className="form-error">{error}</span> : null}
    </>
  );
}
