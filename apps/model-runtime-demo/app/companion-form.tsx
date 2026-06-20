"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CompanionGender } from "@ying-companion/ai-core";

import type { DebugCompanion } from "./lib/debug-types";

const GENDERS: Array<{ value: CompanionGender; label: string }> = [
  { value: "female", label: "女性" },
  { value: "male", label: "男性" },
  { value: "non_binary", label: "非二元" },
  { value: "unknown", label: "未指定" },
];

export function CompanionForm({ companion }: { companion?: DebugCompanion }) {
  const router = useRouter();
  const [name, setName] = useState(companion?.name ?? "");
  const [gender, setGender] = useState<CompanionGender>(companion?.gender ?? "female");
  const [relationship, setRelationship] = useState(companion?.relationship ?? "AI 伴侣");
  const [userAddress, setUserAddress] = useState(companion?.userAddress ?? "");
  const [personality, setPersonality] = useState(companion?.personality ?? "");
  const [speakingStyle, setSpeakingStyle] = useState(companion?.speakingStyle ?? "");
  const [background, setBackground] = useState(companion?.background ?? "");
  const [customInstructions, setCustomInstructions] = useState(companion?.customInstructions ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        companion !== undefined ? `/api/companions/${companion.id}` : "/api/companions",
        {
          method: companion !== undefined ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            gender,
            relationship,
            userAddress,
            personality,
            speakingStyle,
            background,
            customInstructions,
          }),
        },
      );
      const body = (await response.json()) as {
        ok: boolean;
        companion?: DebugCompanion;
        error?: { message: string };
      };

      if (!body.ok || body.companion === undefined) {
        setError(body.error?.message ?? "保存伴侣失败");
        return;
      }

      router.push("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存伴侣失败");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="form-grid">
      <label className="scope-field">
        <span>名称</span>
        <input
          className="scope-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="scope-field">
        <span>性别</span>
        <select
          className="scope-input"
          value={gender}
          onChange={(event) => setGender(event.target.value as CompanionGender)}
        >
          {GENDERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="scope-field">
        <span>关系称呼</span>
        <input
          className="scope-input"
          value={relationship}
          onChange={(event) => setRelationship(event.target.value)}
        />
      </label>
      <label className="scope-field">
        <span>她对我的称呼</span>
        <input
          className="scope-input"
          value={userAddress}
          placeholder="例如：Kris、哥哥、亲爱的"
          onChange={(event) => setUserAddress(event.target.value)}
        />
      </label>
      <label className="scope-field full-span">
        <span>性格</span>
        <textarea
          className="chat-input"
          rows={3}
          value={personality}
          onChange={(event) => setPersonality(event.target.value)}
        />
      </label>
      <label className="scope-field full-span">
        <span>说话风格</span>
        <textarea
          className="chat-input"
          rows={2}
          value={speakingStyle}
          onChange={(event) => setSpeakingStyle(event.target.value)}
        />
      </label>
      <label className="scope-field full-span">
        <span>背景/补充设定</span>
        <textarea
          className="chat-input"
          rows={3}
          value={background}
          onChange={(event) => setBackground(event.target.value)}
        />
      </label>
      <label className="scope-field full-span">
        <span>自定义指令（仅补充角色设定）</span>
        <textarea
          className="chat-input"
          rows={3}
          value={customInstructions}
          onChange={(event) => setCustomInstructions(event.target.value)}
        />
      </label>
      {error !== null ? <p className="form-error full-span">{error}</p> : null}
      <div className="form-actions full-span">
        <button className="button" type="button" disabled={isSaving} onClick={save}>
          {isSaving ? "保存中" : "保存"}
        </button>
      </div>
    </div>
  );
}
