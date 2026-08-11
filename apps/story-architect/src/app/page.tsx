"use client";

import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ProjectLite = {
  id: string;
  title: string;
  initialIdea: string;
  currentStep: string;
  updatedAt: string;
};

const STEP_ROUTES: Record<string, string> = {
  WORLDBUILDING: "worldbuilding",
  CHARACTERS: "characters",
  OUTLINE: "outline",
  CHAPTERS: "chapters",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export default function HomePage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [projects, setProjects] = useState<ProjectLite[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: ProjectLite[]) => setProjects(data))
      .catch(() => setProjects([]));
  }, []);

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!idea.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialIdea: idea.trim() }),
      });
      if (!res.ok) throw new Error("create failed");
      const data = (await res.json()) as { id: string };
      router.push(`/p/${data.id}/worldbuilding`);
    } catch (err) {
      console.error(err);
      alert("创建失败，请重试");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-16">
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 flex items-center gap-2 text-primary">
          <Sparkles className="h-6 w-6" />
          <span className="text-sm font-medium tracking-widest uppercase">
            Ying Story Architect
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">AI 小说创作伙伴</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          从一句灵感出发，和 AI 一起构建世界观、人物、大纲，直至完成章节初稿。
        </p>
      </div>

      <form onSubmit={handleCreate} className="mt-10 flex flex-col gap-3">
        <Textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="输入一句故事灵感，开启你的创作...（例如：赛博朋克都市，2087 年新上海，一个失忆的侦探追查自己的过去）"
          rows={4}
          className="resize-none"
        />
        <Button type="submit" size="lg" disabled={!idea.trim() || submitting} className="self-end">
          {submitting ? "创建中..." : "开始创作"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <div className="mt-14">
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          <span>我的作品</span>
        </div>

        {projects === null ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            加载中...
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            还没有作品，输入灵感开始创作吧
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/p/${p.id}/${STEP_ROUTES[p.currentStep] ?? "worldbuilding"}`}
                className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.title}</span>
                  <span className="text-xs text-muted-foreground">{formatTime(p.updatedAt)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.initialIdea}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
