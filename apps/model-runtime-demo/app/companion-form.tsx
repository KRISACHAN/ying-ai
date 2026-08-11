"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CompanionGender } from "@ying-ai/ai-core";

import type { DebugCompanion } from "./lib/debug-types";

const GENDERS: Array<{ value: CompanionGender; label: string }> = [
  { value: "female", label: "女性" },
  { value: "male", label: "男性" },
  { value: "non_binary", label: "非二元" },
  { value: "unknown", label: "未指定" },
];

interface TraitInput {
  id: string;
  key: string;
  value: string;
}

export function CompanionForm({ companion }: { companion?: DebugCompanion }) {
  const router = useRouter();
  const [name, setName] = useState(companion?.name ?? "");
  const [gender, setGender] = useState<CompanionGender>(companion?.gender ?? "female");
  const [relationship, setRelationship] = useState(companion?.relationship ?? "AI 伴侣");
  const [userDisplayName, setUserDisplayName] = useState(companion?.userDisplayName ?? "");
  const [userAddress, setUserAddress] = useState(companion?.userAddress ?? "");
  const [hobbies, setHobbies] = useState<string[]>(
    companion?.profile.hobbies !== undefined && companion.profile.hobbies.length > 0
      ? companion.profile.hobbies
      : [""],
  );
  const [heightCm, setHeightCm] = useState(formatOptionalNumber(companion?.appearance.heightCm));
  const [weightKg, setWeightKg] = useState(formatOptionalNumber(companion?.appearance.weightKg));
  const [hair, setHair] = useState(companion?.appearance.hair ?? "");
  const [bodyType, setBodyType] = useState(companion?.appearance.bodyType ?? "");
  const [additionalTraits, setAdditionalTraits] = useState<TraitInput[]>(
    companion?.appearance.additionalTraits !== undefined
      ? Object.entries(companion.appearance.additionalTraits).map(([key, value], index) => ({
          id: `trait-${index}-${key}`,
          key,
          value,
        }))
      : [],
  );
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
            userDisplayName,
            userAddress,
            hobbies: hobbies.map((item) => item.trim()).filter((item) => item.length > 0),
            heightCm: parsePositiveNumber(heightCm),
            weightKg: parsePositiveNumber(weightKg),
            hair,
            bodyType,
            additionalTraits: Object.fromEntries(
              additionalTraits
                .map((item) => [item.key.trim(), item.value.trim()] as const)
                .filter(([key, value]) => key.length > 0 && value.length > 0),
            ),
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
      <label className="scope-field">
        <span>我的显示名</span>
        <input
          className="scope-input"
          value={userDisplayName}
          placeholder="例如：陈大鱼头"
          onChange={(event) => setUserDisplayName(event.target.value)}
        />
      </label>
      <div className="scope-field full-span">
        <span>伴侣兴趣</span>
        <div className="form-stack">
          {hobbies.map((hobby, index) => (
            <div className="inline-fields" key={`hobby-${index}`}>
              <input
                className="scope-input"
                value={hobby}
                placeholder="例如：烘焙"
                onChange={(event) => {
                  const next = [...hobbies];
                  next[index] = event.target.value;
                  setHobbies(next);
                }}
              />
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setHobbies(hobbies.filter((_, itemIndex) => itemIndex !== index))}
              >
                删除
              </button>
            </div>
          ))}
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setHobbies([...hobbies, ""])}
          >
            添加兴趣
          </button>
        </div>
      </div>
      <label className="scope-field">
        <span>身高（cm）</span>
        <input
          className="scope-input"
          inputMode="decimal"
          min="0"
          type="number"
          value={heightCm}
          onChange={(event) => setHeightCm(event.target.value)}
        />
      </label>
      <label className="scope-field">
        <span>体重（kg）</span>
        <input
          className="scope-input"
          inputMode="decimal"
          min="0"
          type="number"
          value={weightKg}
          onChange={(event) => setWeightKg(event.target.value)}
        />
      </label>
      <label className="scope-field">
        <span>发型</span>
        <input
          className="scope-input"
          value={hair}
          placeholder="例如：黑色长直发"
          onChange={(event) => setHair(event.target.value)}
        />
      </label>
      <label className="scope-field">
        <span>身材</span>
        <input
          className="scope-input"
          value={bodyType}
          placeholder="例如：匀称"
          onChange={(event) => setBodyType(event.target.value)}
        />
      </label>
      <div className="scope-field full-span">
        <span>其他特征</span>
        <div className="form-stack">
          {additionalTraits.map((trait) => (
            <div className="inline-fields" key={trait.id}>
              <input
                className="scope-input"
                value={trait.key}
                placeholder="特征名，例如：穿衣风格"
                onChange={(event) =>
                  setAdditionalTraits(
                    additionalTraits.map((item) =>
                      item.id === trait.id ? { ...item, key: event.target.value } : item,
                    ),
                  )
                }
              />
              <input
                className="scope-input"
                value={trait.value}
                placeholder="描述，例如：简约温柔"
                onChange={(event) =>
                  setAdditionalTraits(
                    additionalTraits.map((item) =>
                      item.id === trait.id ? { ...item, value: event.target.value } : item,
                    ),
                  )
                }
              />
              <button
                className="button button-secondary"
                type="button"
                onClick={() =>
                  setAdditionalTraits(additionalTraits.filter((item) => item.id !== trait.id))
                }
              >
                删除
              </button>
            </div>
          ))}
          <button
            className="button button-secondary"
            type="button"
            onClick={() =>
              setAdditionalTraits([
                ...additionalTraits,
                { id: `trait-${Date.now()}`, key: "", value: "" },
              ])
            }
          >
            添加特征
          </button>
        </div>
      </div>
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

function parsePositiveNumber(value: string): number | undefined {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function formatOptionalNumber(value: number | undefined): string {
  return value !== undefined ? String(value) : "";
}
