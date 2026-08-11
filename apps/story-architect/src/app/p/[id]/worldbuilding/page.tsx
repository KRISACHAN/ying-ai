"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatPanel } from "@/components/ChatPanel";

interface WorldData {
  era: string;
  geography: string;
  socialStructure: string;
  powerSystem: string;
}

interface ProjectData {
  initialIdea: string;
  world: WorldData | null;
}

const EMPTY_WORLD: WorldData = {
  era: "",
  geography: "",
  socialStructure: "",
  powerSystem: "",
};

const FIELDS: { key: keyof WorldData; label: string }[] = [
  { key: "era", label: "时代背景" },
  { key: "geography", label: "地理环境" },
  { key: "socialStructure", label: "社会结构" },
  { key: "powerSystem", label: "力量/科技体系" },
];

export default function WorldbuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const [world, setWorld] = useState<WorldData>(EMPTY_WORLD);
  // local edits — starts synced with server, diverges when user types
  const [draft, setDraft] = useState<WorldData>(EMPTY_WORLD);
  const [initialIdea, setInitialIdea] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [chatStatus, setChatStatus] = useState<"idle" | "streaming">("idle");

  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return;
      const data = (await res.json()) as ProjectData;
      const next = data.world ?? EMPTY_WORLD;
      setWorld(next);
      setDraft(next);
      if (data.initialIdea) setInitialIdea(data.initialIdea);
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
      if (toolName !== "updateWorld") return;
      setTimeout(() => {
        loadProject();
      }, 150);
    },
    [loadProject, router],
  );

  const dirty = FIELDS.some((f) => (draft[f.key] ?? "") !== (world[f.key] ?? ""));

  const saveDraft = useCallback(async () => {
    if (!dirty) return true;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/world`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error("save failed");
      setWorld(draft);
      return true;
    } catch (err) {
      console.error(err);
      alert("保存失败，请重试");
      return false;
    } finally {
      setSaving(false);
    }
  }, [dirty, draft, projectId]);

  const handleNext = async () => {
    setAdvancing(true);
    const ok = await saveDraft();
    if (!ok) {
      setAdvancing(false);
      return;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/step`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "CHARACTERS" }),
      });
      if (!res.ok) throw new Error("step update failed");
      router.refresh();
      router.push(`/p/${projectId}/characters`);
    } catch (err) {
      console.error(err);
      alert("跳转失败，请重试");
      setAdvancing(false);
    }
  };

  const filledCount = FIELDS.filter((f) => draft[f.key] && draft[f.key].trim().length > 0).length;
  const total = FIELDS.length;
  const allDone = filledCount === total;
  const isEmpty = filledCount === 0;
  const [resetting, setResetting] = useState(false);

  const handleReset = useCallback(async () => {
    if (!window.confirm("重新生成将清空世界观、人物、大纲和章节正文，从头开始。确定继续吗？")) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/reset-from`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "WORLDBUILDING" }),
      });
      if (!res.ok) throw new Error("reset failed");
      router.refresh();
      // Force remount of chat by reloading project (data will be empty, kickoff triggers)
      setWorld(EMPTY_WORLD);
      setDraft(EMPTY_WORLD);
    } catch (err) {
      console.error(err);
      alert("重置失败，请重试");
    } finally {
      setResetting(false);
    }
  }, [projectId, router]);

  return (
    <>
      {/* Left: chat */}
      <div className="flex w-[55%] min-w-0 flex-col border-r">
        {!loading && initialIdea && (
          <ChatPanel
            projectId={projectId}
            step="WORLDBUILDING"
            kickoffMessage={isEmpty ? initialIdea : undefined}
            greeting={
              isEmpty
                ? undefined
                : "世界观已经完成。可以继续让我调整某个字段，手动在右侧编辑，或者点击右下「重新生成」从头再来。"
            }
            onToolUpdated={handleToolUpdated}
            onStatusChange={setChatStatus}
          />
        )}
      </div>

      {/* Right: world panel */}
      <aside className="flex w-[45%] min-w-0 flex-col">
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">世界观设定</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                AI 会自动保存；你也可以手动修改任意字段
              </p>
            </div>
            <StatusPill
              chatStatus={chatStatus}
              filledCount={filledCount}
              total={total}
              allDone={allDone}
              dirty={dirty}
            />
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>进度</span>
              <span>
                {filledCount} / {total}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${(filledCount / total) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {FIELDS.map((f) => {
              const value = draft[f.key];
              const saved = world[f.key];
              const edited = (value ?? "") !== (saved ?? "");
              const filled = value && value.trim().length > 0;
              return (
                <div key={f.key}>
                  <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    {filled ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <CircleDashed className="h-3.5 w-3.5 text-muted-foreground/50" />
                    )}
                    <span className={filled ? "text-foreground" : ""}>{f.label}</span>
                    {edited && (
                      <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        未保存
                      </span>
                    )}
                  </div>
                  <Textarea
                    value={value}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    placeholder={
                      loading
                        ? "加载中..."
                        : chatStatus === "streaming"
                          ? "AI 正在构思这个部分..."
                          : "待填写"
                    }
                    disabled={loading}
                    rows={Math.min(12, Math.max(3, Math.ceil((value?.length ?? 0) / 40)))}
                    className="resize-none leading-relaxed"
                  />
                </div>
              );
            })}
          </div>

          {allDone && !chatStatus && !dirty && (
            <div className="mt-6 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
              世界观已成型，可以继续下一步构建人物。
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-6 py-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={saveDraft} disabled={!dirty || saving}>
              <Save className="h-4 w-4" />
              {saving ? "保存中..." : dirty ? "保存修改" : "已保存"}
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

function StatusPill({
  chatStatus,
  filledCount,
  total,
  allDone,
  dirty,
}: {
  chatStatus: "idle" | "streaming";
  filledCount: number;
  total: number;
  allDone: boolean;
  dirty: boolean;
}) {
  if (chatStatus === "streaming") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        <Sparkles className="h-3 w-3 animate-pulse" />
        AI 正在构建...
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        <Loader2 className="h-3 w-3" />
        有未保存修改
      </span>
    );
  }
  if (allDone) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        已完成
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
      {filledCount}/{total} 字段已填
    </span>
  );
}
