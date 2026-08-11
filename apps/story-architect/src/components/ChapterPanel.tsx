"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  CircleDashed,
  Loader2,
  PencilLine,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface ChapterData {
  id: string;
  number: number;
  title: string;
  summary: string;
  content: string;
}

type ChapterDraft = Partial<Pick<ChapterData, "content" | "title" | "summary">>;
type DraftMap = Record<string, ChapterDraft>;

interface ChapterPanelProps {
  chapters: ChapterData[];
  loading?: boolean;
  streaming?: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  draft: DraftMap;
  onChange: (id: string, patch: ChapterDraft) => void;
  onSave: (id: string) => void;
  onClear: (id: string) => void;
  saving?: boolean;
  savingId?: string | null;
}

function contentStatus(ch: ChapterData, draft?: ChapterDraft): "empty" | "partial" | "full" {
  const content = draft?.content ?? ch.content;
  const len = content.trim().length;
  if (len === 0) return "empty";
  if (len < 300) return "partial";
  return "full";
}

export function ChapterPanel({
  chapters,
  loading = false,
  streaming = false,
  selectedId,
  onSelect,
  draft,
  onChange,
  onSave,
  onClear,
  saving = false,
  savingId,
}: ChapterPanelProps) {
  const selected = selectedId ? (chapters.find((c) => c.id === selectedId) ?? null) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {selected ? (
          <DetailView
            chapter={selected}
            draft={draft[selected.id]}
            streaming={streaming}
            onChange={(patch) => onChange(selected.id, patch)}
            onBack={() => {
              const d = draft[selected.id];
              if (d && isDirty(selected, d)) {
                if (!window.confirm("有未保存的修改，确定返回列表吗？")) return;
              }
              onSelect(null);
            }}
          />
        ) : (
          <ListView
            chapters={chapters}
            draft={draft}
            loading={loading}
            streaming={streaming}
            onSelect={onSelect}
          />
        )}
      </div>

      {selected && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-6 py-3">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (!window.confirm("确认清空本章正文吗？大纲保留，只清空正文。")) return;
              onClear(selected.id);
            }}
            disabled={saving || streaming}
          >
            <Trash2 className="h-4 w-4" />
            清空本章
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSave(selected.id)}
            disabled={!isDirty(selected, draft[selected.id]) || saving || streaming}
          >
            <Save className="h-4 w-4" />
            {saving && savingId === selected.id
              ? "保存中..."
              : isDirty(selected, draft[selected.id])
                ? "保存修改"
                : "已保存"}
          </Button>
        </div>
      )}
    </div>
  );
}

function isDirty(ch: ChapterData, d?: ChapterDraft): boolean {
  if (!d) return false;
  if (d.content !== undefined && d.content !== ch.content) return true;
  if (d.title !== undefined && d.title !== ch.title) return true;
  if (d.summary !== undefined && d.summary !== ch.summary) return true;
  return false;
}

function ListView({
  chapters,
  draft,
  loading,
  streaming,
  onSelect,
}: {
  chapters: ChapterData[];
  draft: DraftMap;
  loading: boolean;
  streaming: boolean;
  onSelect: (id: string) => void;
}) {
  const count = chapters.length;
  const written = chapters.filter(
    (c) => (draft[c.id]?.content ?? c.content).trim().length > 0,
  ).length;

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">章节正文</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            点击章节进入详情；在左侧告诉 AI「生成本章初稿」开始写作
          </p>
        </div>
        <StatusPill count={count} written={written} streaming={streaming} />
      </div>

      {loading ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : count === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          还没有章节，请先在大纲步骤生成章节
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {streaming && (
            <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>AI 正在创作中...</span>
            </div>
          )}
          {chapters.map((ch) => {
            const status = contentStatus(ch, draft[ch.id]);
            const summary = ch.summary;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelect(ch.id)}
                className={cn(
                  "group rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <span>第 {ch.number} 章</span>
                      <span className="opacity-40">·</span>
                      <StatusLabel status={status} />
                    </div>
                    <h3 className="mt-1 truncate text-base font-semibold">{ch.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {summary || "（无概要）"}
                    </p>
                  </div>
                  <StatusIcon status={status} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function DetailView({
  chapter,
  draft,
  streaming,
  onChange,
  onBack,
}: {
  chapter: ChapterData;
  draft?: ChapterDraft;
  streaming: boolean;
  onChange: (patch: ChapterDraft) => void;
  onBack: () => void;
}) {
  const content = draft?.content ?? chapter.content;
  const hasContent = content.trim().length > 0;
  const wordCount = content.length;

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>返回列表</span>
      </button>

      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>第 {chapter.number} 章</span>
        {hasContent && (
          <>
            <span className="opacity-40">·</span>
            <span>{wordCount} 字</span>
          </>
        )}
      </div>
      <h2 className="text-xl font-bold">{chapter.title}</h2>

      {chapter.summary && (
        <p className="mt-2 border-l-2 border-muted pl-3 text-sm italic text-muted-foreground">
          {chapter.summary}
        </p>
      )}

      <div className="my-5 h-px bg-border" />

      <Textarea
        value={content}
        onChange={(e) => onChange({ content: e.target.value })}
        disabled={streaming}
        placeholder={
          streaming
            ? "AI 正在创作本章，请稍候..."
            : "本章还没有正文。在左侧告诉 AI「生成本章初稿」开始创作，或直接在此输入。"
        }
        rows={Math.max(15, Math.min(40, Math.ceil(content.length / 40)))}
        className="resize-none leading-[1.8]"
      />
    </>
  );
}

function StatusIcon({ status }: { status: "empty" | "partial" | "full" }) {
  if (status === "full") {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />;
  }
  if (status === "partial") {
    return <PencilLine className="h-5 w-5 shrink-0 text-amber-500" />;
  }
  return <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />;
}

function StatusLabel({ status }: { status: "empty" | "partial" | "full" }) {
  if (status === "full") return <span className="text-green-600 dark:text-green-400">已生成</span>;
  if (status === "partial")
    return <span className="text-amber-600 dark:text-amber-400">部分生成</span>;
  return <span className="text-muted-foreground">未生成</span>;
}

function StatusPill({
  count,
  written,
  streaming,
}: {
  count: number;
  written: number;
  streaming: boolean;
}) {
  if (streaming) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        <Loader2 className="h-3 w-3 animate-spin" />
        AI 创作中
      </span>
    );
  }
  if (count === 0) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        <CircleDashed className="h-3 w-3" />
        等待大纲
      </span>
    );
  }
  if (written === count) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />共 {count} 章
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground/80">
      {written} / {count} 已生成
    </span>
  );
}
