"use client";

import { ArrowRight, RefreshCw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/ChatPanel";
import { CharacterPanel, type CharacterData } from "@/components/CharacterPanel";

type Draft = Record<string, Partial<CharacterData>>;

interface ProjectData {
  characters: CharacterData[];
}

function applyDraft(characters: CharacterData[], draft: Draft): CharacterData[] {
  return characters.map((c) => ({ ...c, ...(draft[c.id] ?? {}) }));
}

function collectDirty(saved: CharacterData[], draft: Draft): CharacterData[] {
  return saved
    .filter((c) => draft[c.id] && Object.keys(draft[c.id]!).length > 0)
    .map((c) => ({ ...c, ...draft[c.id]! }));
}

export default function CharactersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const [characters, setCharacters] = useState<CharacterData[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [chatStatus, setChatStatus] = useState<"idle" | "streaming">("idle");

  const charsEmpty = characters.length === 0;

  const handleReset = useCallback(async () => {
    if (!window.confirm("重新生成将清空人物、大纲和章节正文，从头开始。确定继续吗？")) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/reset-from`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "CHARACTERS" }),
      });
      if (!res.ok) throw new Error("reset failed");
      router.refresh();
      setCharacters([]);
      setDraft({});
    } catch (err) {
      console.error(err);
      alert("重置失败，请重试");
    } finally {
      setResetting(false);
    }
  }, [projectId, router]);

  const handleDelete = useCallback(
    async (charId: string) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/characters/${charId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("delete failed");
        // Refresh list and drop any draft for the deleted character.
        setCharacters((prev) => prev.filter((c) => c.id !== charId));
        setDraft((prev) => {
          const next = { ...prev };
          delete next[charId];
          return next;
        });
      } catch (err) {
        console.error(err);
        alert("删除失败，请重试");
      }
    },
    [projectId],
  );

  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return;
      const data = (await res.json()) as ProjectData;
      setCharacters(data.characters ?? []);
      // After a refresh load, drop any draft that's now identical to saved data.
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
      if (toolName !== "addCharacter" && toolName !== "deleteCharacter") return;
      setTimeout(() => {
        loadProject();
      }, 150);
    },
    [loadProject, router],
  );

  const handleChange = useCallback((id: string, patch: Partial<CharacterData>) => {
    setDraft((prev) => {
      const merged = { ...(prev[id] ?? {}), ...patch };
      // Drop keys that have reverted to the saved value.
      // We can't diff against the saved list here without it, but we don't need
      // to be perfect — the save button will only send dirty IDs.
      return { ...prev, [id]: merged };
    });
  }, []);

  const dirtyIds = Object.keys(draft).filter((id) => {
    const patch = draft[id];
    if (!patch) return false;
    const saved = characters.find((c) => c.id === id);
    if (!saved) return false;
    return Object.entries(patch).some(
      ([key, value]) => saved[key as keyof CharacterData] !== value,
    );
  });
  const hasDirty = dirtyIds.length > 0;

  const saveDirty = useCallback(async () => {
    if (!hasDirty) return true;
    setSaving(true);
    try {
      const toSave = collectDirty(characters, draft).filter((c) => dirtyIds.includes(c.id));
      await Promise.all(
        toSave.map((c) =>
          fetch(`/api/projects/${projectId}/characters/${c.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draft[c.id]),
          }).then((r) => {
            if (!r.ok) throw new Error(`save ${c.id} failed`);
          }),
        ),
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
  }, [characters, dirtyIds, draft, hasDirty, projectId]);

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
        body: JSON.stringify({ step: "OUTLINE" }),
      });
      if (!res.ok) throw new Error("step update failed");
      router.refresh();
      router.push(`/p/${projectId}/outline`);
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
            step="CHARACTERS"
            kickoffMessage={
              charsEmpty
                ? "世界观已经构建好了，请基于已有的世界观设定，帮我设计故事的核心人物。请你主动提议几位主要角色（包括主角和必要的对手），保存后介绍给我。"
                : undefined
            }
            greeting={
              charsEmpty
                ? undefined
                : "人物已经就位。可以随时补充新角色或调整设定，也可以点右下「重新生成」重设全部人物（会清空已生成的大纲和章节正文）。"
            }
            onToolUpdated={handleToolUpdated}
            onStatusChange={setChatStatus}
          />
        )}
      </div>

      {/* Right: character panel */}
      <aside className="flex w-[45%] min-w-0 flex-col">
        <CharacterPanel
          characters={applyDraft(characters, draft)}
          draft={draft}
          loading={loading}
          streaming={chatStatus === "streaming"}
          onChange={handleChange}
          onDelete={handleDelete}
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
