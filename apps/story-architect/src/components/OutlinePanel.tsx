"use client";

import { CheckCircle2, CircleDashed, Loader2, PencilLine, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface ChapterData {
  id: string;
  number: number;
  title: string;
  summary: string;
}

type Draft = Record<string, Partial<ChapterData>>;

interface OutlinePanelProps {
  chapters: ChapterData[];
  draft: Draft;
  loading?: boolean;
  streaming?: boolean;
  onChange: (id: string, patch: Partial<ChapterData>) => void;
}

function SkeletonChapter() {
  return (
    <div className="animate-pulse rounded-lg border bg-card p-4">
      <div className="h-3 w-16 rounded bg-muted" />
      <div className="mt-2 h-5 w-40 rounded bg-muted" />
      <div className="my-2 h-px bg-border" />
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-muted/70" />
        <div className="h-3 w-11/12 rounded bg-muted/70" />
        <div className="h-3 w-4/5 rounded bg-muted/70" />
      </div>
    </div>
  );
}

export function OutlinePanel({
  chapters,
  draft,
  loading = false,
  streaming = false,
  onChange,
}: OutlinePanelProps) {
  const count = chapters.length;
  const hasDraft = Object.keys(draft).length > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">故事大纲</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              AI 会自动生成；点击标题或概要可手动修改
            </p>
          </div>
          <StatusPill count={count} streaming={streaming} hasDraft={hasDraft} />
        </div>

        {loading ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            加载中...
          </div>
        ) : count === 0 ? (
          streaming ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI 正在规划章节结构，请稍候...</span>
              </div>
              <SkeletonChapter />
              <SkeletonChapter />
              <SkeletonChapter />
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              等待 AI 生成大纲
            </div>
          )
        ) : (
          <div className="flex flex-col gap-4">
            {streaming && (
              <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI 正在重新生成大纲...</span>
              </div>
            )}
            {chapters.map((ch) => {
              const merged = { ...ch, ...(draft[ch.id] ?? {}) };
              const edited = draft[ch.id] && Object.keys(draft[ch.id]!).length > 0;
              return (
                <article key={ch.id} className="rounded-lg border bg-card p-4 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      第 {ch.number} 章
                    </div>
                    {edited ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        <PencilLine className="h-2.5 w-2.5" />
                        未保存
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                        <CheckCircle2 className="h-3 w-3" /> 已保存
                      </span>
                    )}
                  </div>
                  <Input
                    value={merged.title}
                    onChange={(e) => onChange(ch.id, { title: e.target.value })}
                    className="mt-1 h-auto border-0 bg-transparent px-0 text-base font-semibold focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <div className="my-2 h-px bg-border" />
                  <Textarea
                    value={merged.summary}
                    onChange={(e) => onChange(ch.id, { summary: e.target.value })}
                    rows={Math.min(6, Math.max(2, Math.ceil((merged.summary?.length ?? 0) / 40)))}
                    className="resize-none border-0 bg-transparent p-0 text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({
  count,
  streaming,
  hasDraft,
}: {
  count: number;
  streaming: boolean;
  hasDraft: boolean;
}) {
  if (streaming) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        <Sparkles className="h-3 w-3 animate-pulse" />
        AI 正在构建...
      </span>
    );
  }
  if (hasDraft) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        <PencilLine className="h-3 w-3" />
        有修改
      </span>
    );
  }
  if (count > 0) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />共 {count} 章
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
      <CircleDashed className="h-3 w-3" />
      等待生成
    </span>
  );
}
