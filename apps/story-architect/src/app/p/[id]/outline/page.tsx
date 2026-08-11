"use client";

import { ArrowRight, RefreshCw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/ChatPanel";
import { OutlinePanel, type ChapterData } from "@/components/OutlinePanel";

type Draft = Record<string, Partial<ChapterData>>;

interface ProjectData {
  chapters: ChapterData[];
}

export default function OutlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [chatStatus, setChatStatus] = useState<"idle" | "streaming">("idle");

  const outlineEmpty = chapters.length === 0;

  const handleReset = useCallback(async () => {
    if (!window.confirm("重新生成将清空大纲和章节正文，从头开始。确定继续吗？")) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/reset-from`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "OUTLINE" }),
      });
      if (!res.ok) throw new Error("reset failed");
      router.refresh();
      setChapters([]);
      setDraft({});
    } catch (err) {
      console.error(err);
      alert("重置失败，请重试");
    } finally {
      setResetting(false);
    }
  }, [projectId, router]);

  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return;
      const data = (await res.json()) as ProjectData;
      setChapters(data.chapters ?? []);
      setDraft({});
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const handleToolUpdated = useCallback(
    (toolName: string) => {
      if (toolName === "setProjectTitle") {
        setTimeout(() => {
          router.refresh();
          loadProject();
        }, 150);
        return;
      }
      if (toolName !== "batchCreateChapters") return;
      setTimeout(() => {
        loadProject();
      }, 200);
    },
    [loadProject, router],
  );

  const handleChange = useCallback((id: string, patch: Partial<ChapterData>) => {
    setDraft((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  }, []);

  const dirtyIds = Object.keys(draft).filter((id) => {
    const patch = draft[id];
    if (!patch) return false;
    const saved = chapters.find((c) => c.id === id);
    if (!saved) return false;
    return Object.entries(patch).some(([key, value]) => saved[key as keyof ChapterData] !== value);
  });
  const hasDirty = dirtyIds.length > 0;

  const saveDirty = useCallback(async () => {
    if (!hasDirty) return true;
    setSaving(true);
    try {
      await Promise.all(
        dirtyIds.map((id) => {
          const patch = draft[id]!;
          return fetch(`/api/projects/${projectId}/chapters/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          }).then((r) => {
            if (!r.ok) throw new Error(`save ${id} failed`);
          });
        }),
      );
      setDraft({});
      return true;
    } catch (err) {
      console.error(err);
      alert("保存失败，请重试");
      return false;
    } finally {
      setSaving(false);
    }
  }, [dirtyIds, draft, hasDirty, projectId]);

  const handleNext = async () => {
    setAdvancing(true);
    const ok = await saveDirty();
    if (!ok) {
      setAdvancing(false);
      return;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/step`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "CHAPTERS" }),
      });
      if (!res.ok) throw new Error("step update failed");
      router.refresh();
      router.push(`/p/${projectId}/chapters`);
    } catch (err) {
      console.error(err);
      alert("跳转失败，请重试");
      setAdvancing(false);
    }
  };

  return (
    <>
      {/* Left: chat */}
      <div className="flex w-[55%] min-w-0 flex-col border-r">
        {!loading && (
          <ChatPanel
            projectId={projectId}
            step="OUTLINE"
            kickoffMessage={
              outlineEmpty
                ? "人物已经就位，请基于现有的世界观和人物，帮我生成整部小说的章节大纲。请直接主动生成一版 10-15 章的大纲，一次性保存全部章节，然后告诉我你的结构设计思路。"
                : undefined
            }
            greeting={
              outlineEmpty
                ? undefined
                : "大纲已生成。可以让我调整某一章或重新生成，也可以点右下「下一步」开始写正文。点「重新生成」会清空已有大纲和章节正文。"
            }
            onToolUpdated={handleToolUpdated}
            onStatusChange={setChatStatus}
          />
        )}
      </div>

      {/* Right: outline panel */}
      <aside className="flex w-[45%] min-w-0 flex-col">
        <OutlinePanel
          chapters={chapters}
          draft={draft}
          loading={loading}
          streaming={chatStatus === "streaming"}
          onChange={handleChange}
        />
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-6 py-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={saveDirty} disabled={!hasDirty || saving}>
              <Save className="h-4 w-4" />
              {saving ? "保存中..." : hasDirty ? `保存修改 (${dirtyIds.length})` : "已保存"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={resetting || chatStatus === "streaming"}
              className="text-muted-foreground hover:text-destructive"
            >
              <RefreshCw className="h-4 w-4" />
              {resetting ? "重置中..." : "重新生成"}
            </Button>
          </div>
          <Button onClick={handleNext} disabled={advancing}>
            下一步
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </aside>
    </>
  );
}
