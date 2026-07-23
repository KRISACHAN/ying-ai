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
        persisted?: boolean;
        errors?: Array<{ message: string }>;
        error?: { message: string };
      };

      if (!body.ok) {
        setError(
          body.errors?.map((item) => item.message).join("\n") ?? body.error?.message ?? "校验失败",
        );
        return;
      }

      setResult(`校验通过：${body.storyId}。V1.3 仅预览导入，不写入旧存档 definition。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入 JSON 无效");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <section className="start-panel story-import-panel">
      <label className="scope-field full-span">
        <span>Story Definition JSON 导入预览</span>
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
        {isChecking ? "校验中" : "校验 JSON"}
      </button>
      {result !== null ? <p className="meta-line">{result}</p> : null}
      {error !== null ? <pre className="form-error full-span">{error}</pre> : null}
    </section>
  );
}
