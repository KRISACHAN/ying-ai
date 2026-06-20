"use client";

import { useState } from "react";

import type { MemoryImportance, MemoryRecord, MemoryType } from "@ying-companion/ai-core";

const TYPES: MemoryType[] = ["fact", "preference", "relationship", "event"];

export function MemoryManager({
  companionId,
  initialMemories,
}: {
  companionId: string;
  initialMemories: MemoryRecord[];
}) {
  const [memories, setMemories] = useState(initialMemories);
  const [type, setType] = useState<MemoryType>("fact");
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState<MemoryImportance>(3);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function reload() {
    const response = await fetch(`/api/companions/${companionId}/memories`);
    const body = (await response.json()) as {
      ok: boolean;
      memories?: MemoryRecord[];
      error?: { message: string };
    };

    if (body.ok && body.memories !== undefined) {
      setMemories(body.memories);
    } else {
      setError(body.error?.message ?? "加载记忆失败");
    }
  }

  async function save() {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        editingId === null
          ? `/api/companions/${companionId}/memories`
          : `/api/companions/${companionId}/memories/${editingId}`,
        {
          method: editingId === null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, content, importance }),
        },
      );
      const body = (await response.json()) as {
        ok: boolean;
        memory?: MemoryRecord;
        error?: { message: string };
      };

      if (!body.ok) {
        setError(body.error?.message ?? "保存记忆失败");
        return;
      }

      setEditingId(null);
      setContent("");
      setType("fact");
      setImportance(3);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存记忆失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(memoryId: string) {
    if (!window.confirm("确认删除这条长期记忆？")) {
      return;
    }

    const response = await fetch(`/api/companions/${companionId}/memories/${memoryId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      setMemories((previous) => previous.filter((memory) => memory.id !== memoryId));
    } else {
      const body = (await response.json()) as { error?: { message: string } };
      setError(body.error?.message ?? "删除记忆失败");
    }
  }

  function startEdit(memory: MemoryRecord) {
    setEditingId(memory.id);
    setType(memory.type);
    setContent(memory.content);
    setImportance(memory.importance);
  }

  return (
    <div className="memory-admin">
      <section className="memory-editor">
        <h2>{editingId === null ? "新增记忆" : "编辑记忆"}</h2>
        <div className="form-grid">
          <label className="scope-field">
            <span>类型</span>
            <select
              className="scope-input"
              value={type}
              onChange={(event) => setType(event.target.value as MemoryType)}
            >
              {TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="scope-field">
            <span>重要度</span>
            <input
              className="scope-input"
              type="number"
              min={1}
              max={5}
              value={importance}
              onChange={(event) =>
                setImportance(
                  Math.min(5, Math.max(1, Number(event.target.value))) as MemoryImportance,
                )
              }
            />
          </label>
          <label className="scope-field full-span">
            <span>内容</span>
            <textarea
              className="chat-input"
              rows={4}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>
        </div>
        <div className="form-actions">
          <button className="button" type="button" disabled={isSaving} onClick={save}>
            {isSaving ? "保存中" : "保存记忆"}
          </button>
          {editingId !== null ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setEditingId(null);
                setContent("");
              }}
            >
              取消编辑
            </button>
          ) : null}
        </div>
        {error !== null ? <p className="form-error">{error}</p> : null}
      </section>

      <section className="memory-table">
        <h2>长期记忆列表</h2>
        {memories.length === 0 ? (
          <div className="empty-state">当前伴侣还没有长期记忆。</div>
        ) : (
          <div className="memory-admin-list">
            {memories.map((memory) => (
              <article className="memory-admin-item" key={memory.id}>
                <div>
                  <span>
                    {memory.type} · importance {memory.importance}
                  </span>
                  <p>{memory.content}</p>
                  <small>
                    created {formatDate(memory.createdAt)} · updated{" "}
                    {memory.updatedAt !== undefined ? formatDate(memory.updatedAt) : "-"}
                  </small>
                </div>
                <div className="card-actions">
                  <button className="link-button" type="button" onClick={() => startEdit(memory)}>
                    编辑
                  </button>
                  <button
                    className="link-button danger"
                    type="button"
                    onClick={() => void remove(memory.id)}
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
