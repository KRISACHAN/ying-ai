import type { StoryDefinition } from "@ying-companion/story-core";

export const fogHarborMystery: StoryDefinition = {
  id: "fog-harbor-mystery",
  version: "1.3-test",
  title: "雾港疑云",
  description: "一段用于 story-postgres 验证的最小雾港故事。",
  premise: "雾港的酒馆菜单背后藏着走私路线。",
  genre: ["mystery"],
  tone: ["noir"],
  playerRole: {
    identity: "外来调查员",
    knownFacts: ["蓝月酒馆最近变得异常安静。"],
  },
  characters: [
    {
      id: "evelyn",
      name: "伊芙琳",
      description: "蓝月酒馆老板。",
      personality: ["谨慎"],
      speakingStyle: "短句，避免直说秘密。",
      publicBackground: "她熟悉旧港口的每条巷子。",
      goals: ["保护妹妹"],
      narrativeRole: "supporting",
    },
  ],
  scenes: [
    {
      id: "blue-moon-tavern",
      title: "蓝月酒馆",
      description: "潮湿的木桌上压着一张旧菜单。",
      availableCharacterIds: ["evelyn"],
    },
  ],
  lore: [
    {
      id: "menu-code",
      title: "菜单暗码",
      content: "蓝月酒馆菜单上的月相标记指向旧港路线。",
      keywords: ["菜单", "酒单"],
      activation: "keyword",
      priority: 10,
    },
    {
      id: "hidden-route",
      title: "隐藏路线",
      content: "旧港三号仓下方有一条潮汐密道。",
      keywords: ["路线", "密道"],
      activation: { type: "keyword" },
      secret: true,
      revealConditions: [{ type: "has_clue", clueId: "menu-mark" }],
      priority: 20,
    },
  ],
  items: [],
  clues: [{ id: "menu-mark", title: "菜单月相标记" }],
  events: [{ id: "route-opened", title: "路线被揭示" }],
  openingSceneId: "blue-moon-tavern",
  openingText: "雾贴着窗，伊芙琳擦拭着同一个杯子。",
  attributes: [
    {
      key: "clueHeat",
      label: "线索热度",
      type: "number",
      scope: "story",
      min: 0,
      max: 10,
      default: 0,
      writable: true,
    },
  ],
  narrativeRules: {
    mustFollow: ["状态变化只能来自已校验的 plan。"],
    mustAvoid: ["不要提前泄露隐藏路线。"],
    pov: "second_person",
    responseLengthHint: "short",
  },
};
