"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { StepProgress } from "@/components/StepProgress";
import { Input } from "@/components/ui/input";
import type { Step } from "@/lib/ai";
import { cn } from "@/lib/utils";

const PATH_TO_STEP: Record<string, Step> = {
  worldbuilding: "WORLDBUILDING",
  characters: "CHARACTERS",
  outline: "OUTLINE",
  chapters: "CHAPTERS",
};

function detectStep(pathname: string): Step | null {
  // /p/[id]/<step-segment>
  const match = pathname.match(/^\/p\/[^/]+\/([^/]+)/);
  if (!match) return null;
  return PATH_TO_STEP[match[1]] ?? null;
}

export function ProjectHeader({ projectId, title }: { projectId: string; title: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentStep = detectStep(pathname) ?? "WORLDBUILDING";

  const [editing, setEditing] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external title changes (e.g. AI renames via tool)
  useEffect(() => {
    if (!editing) setLocalTitle(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitTitle = async () => {
    const trimmed = localTitle.trim();
    if (!trimmed || trimmed === title) {
      setLocalTitle(title);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/title`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error("save title failed");
      setEditing(false);
      router.refresh(); // so server components re-fetch the new title
    } catch (err) {
      console.error(err);
      alert("保存书名失败，请重试");
      setLocalTitle(title);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setLocalTitle(title);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTitle();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
      <Link
        href="/"
        className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        <span>Ying Story Architect</span>
      </Link>
      <StepProgress currentStep={currentStep} projectId={projectId} />
      <div className="flex w-40 justify-end">
        {editing ? (
          <Input
            ref={inputRef}
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitTitle}
            disabled={saving}
            className="h-7 w-full text-right text-sm"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="点击重命名"
            className={cn(
              "group inline-flex max-w-full items-center gap-1 truncate rounded px-1 text-right text-sm text-muted-foreground transition-colors hover:text-foreground",
            )}
          >
            <span className="truncate">{localTitle}</span>
            <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
          </button>
        )}
      </div>
    </header>
  );
}
