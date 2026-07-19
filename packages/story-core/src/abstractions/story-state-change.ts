import type { StoryAttrValue } from "./story-state";

export type StoryStateChange =
  | { type: "set_scene"; sceneId: string }
  | { type: "set_character_alive"; characterId: string; alive: boolean }
  | { type: "set_character_present"; characterId: string; present: boolean }
  | { type: "add_inventory_item"; itemId: string }
  | { type: "remove_inventory_item"; itemId: string }
  | { type: "add_clue"; clueId: string }
  | { type: "add_event"; eventId: string }
  | { type: "add_revealed_lore"; loreId: string }
  | { type: "set_relationship"; characterId: string; value: number }
  | {
      type: "set_attr";
      key: string;
      scopeRef?: string;
      value: StoryAttrValue;
    };
