"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateStorySessionButton({ storyId }: { storyId: string }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createSession() {
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/story-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        session?: { id: string; storyId: string };
        error?: { message: string };
      };

      if (!body.ok || body.session === undefined) {
        setError(body.error?.message ?? "创建存档失败");
        return;
      }

      router.push(`/stories/${body.session.storyId}/sessions/${body.session.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建存档失败");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <>
      <button className="button" type="button" disabled={isCreating} onClick={createSession}>
        {isCreating ? "创建中" : "新建存档"}
      </button>
      {error !== null ? <p className="form-error">{error}</p> : null}
    </>
  );
}

export function StoryImportPanel() {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  async function checkImport() {
    setIsChecking(true);
    setResult(null);
    setError(null);

    try {
      const parsed = JSON.parse(source) as unknown;
      const response = await fetch("/api/stories/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const body = (await response.json()) as {
        ok: boolean;
        storyId?: string;
        definitionVersion?: string;
        registered?: boolean;
        registration?: "registered" | "unchanged";
        lifetime?: "process";
        errors?: Array<{ message: string }>;
        error?: { message: string };
      };

      if (!body.ok) {
        setError(
          body.errors?.map((item) => item.message).join("\n") ?? body.error?.message ?? "校验失败",
        );
        return;
      }

      setResult(
        `已${body.registration === "unchanged" ? "确认" : "注册"}：${body.storyId} v${body.definitionVersion}。当前 Demo 进程内可创建存档；重启后临时目录会消失，已创建存档仍使用冻结 snapshot。`,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入 JSON 无效");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <section className="start-panel story-import-panel">
      <label className="scope-field full-span">
        <span>Story Definition JSON 导入</span>
        <textarea
          className="chat-input"
          rows={5}
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
      </label>
      <button
        className="button button-secondary"
        type="button"
        disabled={source.trim() === "" || isChecking}
        onClick={checkImport}
      >
        {isChecking ? "导入中" : "校验并注册"}
      </button>
      {result !== null ? <p className="meta-line">{result}</p> : null}
      {error !== null ? <pre className="form-error full-span">{error}</pre> : null}
    </section>
  );
}
