"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { ChapterPanel, type ChapterData } from "@/components/ChapterPanel";

interface ProjectData {
  chapters: ChapterData[];
}

const CHAPTER_TOOL_NAMES = new Set(["saveChapterContent", "appendChapterContent"]);
const TITLE_TOOL_NAME = "setProjectTitle";

type ChapterDraft = Partial<Pick<ChapterData, "content" | "title" | "summary">>;
type DraftMap = Record<string, ChapterDraft>;

export default function ChaptersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [draft, setDraft] = useState<DraftMap>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chatStatus, setChatStatus] = useState<"idle" | "streaming">("idle");
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Flag set when a chapter tool is detected; consumed on streaming→idle transition.
  const needsRefetchRef = useRef(false);
  const needsTitleRefreshRef = useRef(false);

  const loadProject = useCallback(async () => {
    try {
      // Bypass Next.js client fetch cache so we always see the latest DB state.
      const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as ProjectData;
      setChapters(data.chapters ?? []);
      // Drop drafts whose content matches the server (avoid stale dirty state after AI save)
      setDraft((prev) => {
        const next: DraftMap = {};
        for (const ch of data.chapters ?? []) {
          const d = prev[ch.id];
          if (!d) continue;
          const dirty =
            (d.content !== undefined && d.content !== ch.content) ||
            (d.title !== undefined && d.title !== ch.title) ||
            (d.summary !== undefined && d.summary !== ch.summary);
          if (dirty) next[ch.id] = d;
        }
        return next;
      });
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // When the AI finishes streaming after a chapter tool call, refetch.
  useEffect(() => {
    if (chatStatus !== "idle") return;
    if (needsRefetchRef.current) {
      needsRefetchRef.current = false;
      // Small delay to let the DB transaction fully commit.
      setTimeout(() => loadProject(), 150);
    }
    if (needsTitleRefreshRef.current) {
      needsTitleRefreshRef.current = false;
      setTimeout(() => {
        router.refresh();
        loadProject();
      }, 150);
    }
  }, [chatStatus, loadProject, router]);

  const handleToolUpdated = useCallback((toolName: string) => {
    if (toolName === TITLE_TOOL_NAME) {
      // Defer the refresh until streaming ends, so the layout (Server Component)
      // picks up the new title after the tool completes.
      needsTitleRefreshRef.current = true;
      return;
    }
    if (CHAPTER_TOOL_NAMES.has(toolName)) {
      // Defer refetch until streaming ends — at that point the tool execution
      // has committed the content to the DB, so loadProject will see it.
      needsRefetchRef.current = true;
    }
  }, []);

  // Prevent switching chapters while streaming (avoids currentChapterId mismatch).
  const handleSelect = useCallback(
    (id: string | null) => {
      if (chatStatus === "streaming") return;
      setSelectedId(id);
    },
    [chatStatus],
  );

  const handleChange = useCallback((id: string, patch: ChapterDraft) => {
    setDraft((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), ...patch },
    }));
  }, []);

  const handleSave = useCallback(
    async (id: string) => {
      const patch = draft[id];
      if (!patch) return;
      setSaving(true);
      setSavingId(id);
      try {
        const res = await fetch(`/api/projects/${projectId}/chapters/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error("save failed");
        // Update local baseline
        setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
        setDraft((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } catch (err) {
        console.error(err);
        alert("保存失败，请重试");
      } finally {
        setSaving(false);
        setSavingId(null);
      }
    },
    [draft, projectId],
  );

  const handleClear = useCallback(
    async (id: string) => {
      setSaving(true);
      setSavingId(id);
      try {
        const res = await fetch(`/api/projects/${projectId}/chapters/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "" }),
        });
        if (!res.ok) throw new Error("clear failed");
        setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, content: "" } : c)));
        setDraft((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } catch (err) {
        console.error(err);
        alert("清空失败，请重试");
      } finally {
        setSaving(false);
        setSavingId(null);
      }
    },
    [projectId],
  );

  return (
    <>
      {/* Left: chat */}
      <div className="flex w-[55%] min-w-0 flex-col border-r">
        {!loading && (
          <ChatPanel
            // Re-mount when the selected chapter changes so the previous
            // chapter's conversation is cleared and the transport body is
            // rebuilt with the new currentChapterId.
            key={selectedId ?? "no-chapter"}
            projectId={projectId}
            step="CHAPTERS"
            body={selectedId ? { currentChapterId: selectedId } : {}}
            onToolUpdated={handleToolUpdated}
            onStatusChange={setChatStatus}
            disabled={!selectedId}
            disabledReason="请先在右侧选择要写的章节"
          />
        )}
      </div>

      {/* Right: chapter panel with editor (no next button — final step) */}
      <aside className="flex w-[45%] min-w-0 flex-col">
        <ChapterPanel
          chapters={chapters}
          loading={loading}
          streaming={chatStatus === "streaming"}
          selectedId={selectedId}
          onSelect={handleSelect}
          draft={draft}
          onChange={handleChange}
          onSave={handleSave}
          onClear={handleClear}
          saving={saving}
          savingId={savingId}
        />
      </aside>
    </>
  );
}
