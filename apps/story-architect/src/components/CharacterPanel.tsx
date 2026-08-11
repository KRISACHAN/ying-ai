"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Loader2,
  PencilLine,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { roleLabel } from "@/lib/ai";

export interface CharacterData {
  id: string;
  name: string;
  role: string;
  identity: string;
  motivation: string;
  personality: string;
  appearance: string;
  arc: string;
  relationships: string;
}

type Draft = Record<string, Partial<CharacterData>>;

interface CharacterPanelProps {
  characters: CharacterData[];
  draft: Draft;
  loading?: boolean;
  streaming?: boolean;
  onChange: (id: string, patch: Partial<CharacterData>) => void;
  onDelete: (id: string) => void;
}

const ROLE_STYLES: Record<string, string> = {
  protagonist: "bg-primary/10 text-primary border-primary/30",
  antagonist: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
  supporting: "bg-muted text-muted-foreground border-border",
};

const ROLE_ORDER = ["protagonist", "antagonist", "supporting"] as const;

function roleClass(role: string): string {
  return ROLE_STYLES[role] ?? ROLE_STYLES.supporting;
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <div className="h-5 w-20 rounded bg-muted" />
        <div className="h-5 w-12 rounded-full bg-muted" />
      </div>
      <div className="mt-2 h-3 w-40 rounded bg-muted/70" />
      <div className="mt-3 space-y-1.5">
        <div className="h-3 w-full rounded bg-muted/60" />
        <div className="h-3 w-4/5 rounded bg-muted/60" />
      </div>
    </div>
  );
}

const LONG_FIELDS: { key: keyof CharacterData; label: string; rows: number }[] = [
  { key: "identity", label: "身份", rows: 2 },
  { key: "motivation", label: "核心动机", rows: 3 },
  { key: "personality", label: "性格", rows: 2 },
  { key: "appearance", label: "外貌", rows: 2 },
  { key: "arc", label: "成长弧光", rows: 2 },
  { key: "relationships", label: "人物关系", rows: 2 },
];

export function CharacterPanel({
  characters,
  draft,
  loading = false,
  streaming = false,
  onChange,
  onDelete,
}: CharacterPanelProps) {
  const count = characters.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">人物角色</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              AI 会自动保存；点击任意字段可手动修改
            </p>
          </div>
          <StatusPill
            count={count}
            streaming={streaming}
            hasDraft={Object.keys(draft).length > 0}
          />
        </div>

        {loading ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            加载中...
          </div>
        ) : count === 0 ? (
          streaming ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI 正在构思核心角色，请稍候...</span>
              </div>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              <User className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
              等待 AI 生成第一位角色
            </div>
          )
        ) : (
          <div className="flex flex-col gap-3">
            {streaming && (
              <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI 正在追加角色...</span>
              </div>
            )}
            {characters.map((c) => (
              <CharacterCard
                key={c.id}
                saved={c}
                local={draft[c.id]}
                onChange={(patch) => onChange(c.id, patch)}
                onDelete={() => onDelete(c.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CharacterCard({
  saved,
  local,
  onChange,
  onDelete,
}: {
  saved: CharacterData;
  local?: Partial<CharacterData>;
  onChange: (patch: Partial<CharacterData>) => void;
  onDelete: () => void;
}) {
  const merged: CharacterData = { ...saved, ...local };
  const edited = local && Object.keys(local).length > 0;
  const [expanded, setExpanded] = useState(true);

  return (
    <article className="rounded-lg border bg-card p-4 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            value={merged.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="h-7 w-32 border-0 bg-transparent px-0 text-base font-semibold focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="flex items-center gap-1">
            {ROLE_ORDER.map((r) => {
              const active = merged.role === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => onChange({ role: r })}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                    active ? roleClass(r) : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {roleLabel(r)}
                </button>
              );
            })}
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
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`确认删除人物「${saved.name}」吗？`)) {
                onDelete();
              }
            }}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="删除人物"
            title="删除人物"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted"
            aria-label={expanded ? "折叠" : "展开"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3">
          {LONG_FIELDS.map((f) => (
            <div key={f.key}>
              <div className="mb-1 text-xs font-medium text-muted-foreground">{f.label}</div>
              <Textarea
                value={(merged[f.key] as string) ?? ""}
                onChange={(e) => onChange({ [f.key]: e.target.value } as Partial<CharacterData>)}
                rows={f.rows}
                className="resize-none text-sm leading-relaxed"
              />
            </div>
          ))}
        </div>
      )}
    </article>
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
        <CheckCircle2 className="h-3 w-3" />
        {count} 位
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
