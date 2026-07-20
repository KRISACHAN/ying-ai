import type { LoreEntry } from "../abstractions/story-definition";
import type {
  LoreProvider,
  LoreRecallInput,
  LoreRecallResult,
  RecalledLoreEntry,
} from "../abstractions/lore-provider";
import { evaluateStoryConditions } from "../state/evaluate-story-condition";

export class KeywordLoreProvider implements LoreProvider {
  async recall(input: LoreRecallInput): Promise<LoreRecallResult> {
    const sceneId = input.currentSceneId ?? input.sceneId ?? input.state.currentSceneId;
    const revealedLoreIds = input.revealedLoreIds ?? input.state.revealedLoreIds ?? [];
    const filtered: Array<{ loreId: string; reason: string }> = [];
    const candidates: Array<RecalledLoreEntry & { specificity: number; index: number }> = [];

    for (const [index, entry] of input.definition.lore.entries()) {
      const sceneMatch = matchesScene(entry, sceneId);
      if (!sceneMatch) {
        filtered.push({ loreId: entry.id, reason: "scene" });
        continue;
      }
      if (!matchesCharacters(entry, input.activeCharacterIds)) {
        filtered.push({ loreId: entry.id, reason: "character" });
        continue;
      }

      const isRevealed = revealedLoreIds.includes(entry.id);
      const activation = evaluateActivation(entry, input);
      if (!activation.active) {
        filtered.push({ loreId: entry.id, reason: "activation" });
        continue;
      }

      const revealConditionsMet =
        entry.secret &&
        !isRevealed &&
        entry.revealConditions?.length &&
        evaluateStoryConditions({
          definition: input.definition,
          state: input.state,
          conditions: entry.revealConditions,
        });

      candidates.push({
        entry,
        visibility:
          entry.secret && !isRevealed && !revealConditionsMet
            ? "planner_only"
            : "planner_and_renderer",
        activationReason: activation.reasons,
        priority: entry.priority ?? 0,
        estimatedTokens: estimateTokens(entry.content),
        specificity: activation.specificity,
        index,
      });
    }

    const entries: RecalledLoreEntry[] = [];
    let budget = input.totalTokenBudget ?? Number.POSITIVE_INFINITY;
    const sorted = candidates.sort(
      (left, right) =>
        right.priority - left.priority ||
        right.specificity - left.specificity ||
        left.index - right.index,
    );
    for (const candidate of sorted) {
      if (entries.length >= (input.maxEntries ?? Number.POSITIVE_INFINITY)) {
        filtered.push({ loreId: candidate.entry.id, reason: "max_entries" });
        continue;
      }
      const budgetCost = Math.min(
        candidate.estimatedTokens,
        candidate.entry.tokenBudget ?? candidate.estimatedTokens,
      );
      if (budgetCost > budget) {
        filtered.push({ loreId: candidate.entry.id, reason: "budget" });
        continue;
      }
      budget -= budgetCost;
      entries.push(candidate);
    }

    return { entries, filtered };
  }
}

function matchesScene(entry: LoreEntry, sceneId: string): boolean {
  return !entry.sceneIds || entry.sceneIds.length === 0 || entry.sceneIds.includes(sceneId);
}

function matchesCharacters(entry: LoreEntry, characterIds: string[]): boolean {
  return (
    !entry.characterIds ||
    entry.characterIds.length === 0 ||
    entry.characterIds.some((characterId) => characterIds.includes(characterId))
  );
}

function evaluateActivation(
  entry: LoreEntry,
  input: LoreRecallInput,
): { active: boolean; reasons: string[]; specificity: number } {
  const activation =
    typeof entry.activation === "string" ? { type: entry.activation } : entry.activation;
  const keywords =
    "keywords" in activation ? (activation.keywords ?? entry.keywords) : entry.keywords;
  const keywordMatched = matchesKeyword(input.userInput, keywords);

  switch (activation.type) {
    case "always":
      return { active: true, reasons: ["always"], specificity: 1 };
    case "keyword":
      return {
        active: keywordMatched,
        reasons: keywordMatched ? ["keyword"] : [],
        specificity: 2,
      };
    case "state": {
      const matched = evaluateStoryConditions({
        definition: input.definition,
        state: input.state,
        conditions: activation.conditions,
      });
      return { active: matched, reasons: matched ? ["state"] : [], specificity: 3 };
    }
    case "keyword_and_state": {
      const stateMatched = evaluateStoryConditions({
        definition: input.definition,
        state: input.state,
        conditions: activation.conditions,
      });
      return {
        active: keywordMatched && stateMatched,
        reasons: keywordMatched && stateMatched ? ["keyword", "state"] : [],
        specificity: 4,
      };
    }
  }
}

function matchesKeyword(userInput: string, keywords: string[] | undefined): boolean {
  if (!keywords || keywords.length === 0) {
    return false;
  }
  const normalizedInput = userInput.toLowerCase();
  return keywords.some((keyword) => normalizedInput.includes(keyword.toLowerCase()));
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}
