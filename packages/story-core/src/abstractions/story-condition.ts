export type StoryCondition =
  | { type: "always" }
  | { type: "has_clue"; clueId: string }
  | { type: "has_event"; eventId: string }
  | { type: "has_item"; itemId: string }
  | { type: "in_scene"; sceneId: string }
  | {
      type: "attr_gte";
      key: string;
      scopeRef?: string;
      value: number;
    }
  | {
      type: "attr_eq";
      key: string;
      scopeRef?: string;
      value: boolean | number | string;
    };
