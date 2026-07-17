import type { LoreEntry } from "../abstractions/story-definition";
import type {
  LoreProvider,
  LoreRecallInput,
  LoreRecallResult,
} from "../abstractions/lore-provider";

export class KeywordLoreProvider implements LoreProvider {
  async recall(input: LoreRecallInput): Promise<LoreRecallResult> {
    const normalizedInput = input.userInput.toLowerCase();
    const entries = input.definition.lore
      .filter((entry) => !entry.secret)
      .filter((entry) => matchesScene(entry, input.sceneId))
      .filter((entry) => matchesCharacters(entry, input.activeCharacterIds))
      .filter(
        (entry) =>
          entry.activation === "always" ||
          (entry.keywords ?? []).some((keyword) => normalizedInput.includes(keyword.toLowerCase())),
      )
      .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));

    return { entries };
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
