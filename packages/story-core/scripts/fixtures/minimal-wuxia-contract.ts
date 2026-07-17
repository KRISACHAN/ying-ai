import type { StoryDefinition } from "../../src/abstractions/story-definition";

export const minimalWuxiaContract: StoryDefinition = {
  id: "minimal-wuxia-contract",
  version: "1.0.0",
  title: "青崖试剑",
  description: "最小武侠契约故事，用于验证不同 Attribute Schema 能被同一 Runtime 支持。",
  premise: "玩家是青崖门外门弟子，正在山门前接受第一场试炼。",
  genre: ["wuxia"],
  tone: ["martial", "direct"],
  playerRole: {
    identity: "青崖门外门弟子",
    knownFacts: ["今日是试剑日", "山门长老会观察表现"],
  },
  characters: [
    {
      id: "elder-lin",
      name: "林长老",
      description: "青崖门执事长老，负责外门弟子试剑。",
      personality: ["严厉", "公正"],
      speakingStyle: "简短、有门派规矩感。",
      publicBackground: "林长老主持外门试剑已有十年。",
      goals: ["筛选可培养弟子"],
      narrativeRole: "supporting",
    },
  ],
  scenes: [
    {
      id: "mountain-gate",
      title: "青崖山门",
      description: "石阶尽头悬着青崖门匾，晨雾里有剑鸣回响。",
      availableCharacterIds: ["elder-lin"],
    },
  ],
  lore: [
    {
      id: "qingya-rules",
      title: "试剑规矩",
      content: "外门弟子需先守住三招，再谈进阶。",
      activation: "always",
    },
  ],
  items: [],
  clues: [],
  events: [],
  openingSceneId: "mountain-gate",
  openingText: "林长老把木剑抛到你手边，示意你上前。",
  attributes: [
    {
      key: "combatPower",
      label: "战斗力",
      type: "number",
      scope: "player",
      required: true,
      default: 10,
      min: 0,
      max: 100,
    },
    {
      key: "sectStanding",
      label: "门派地位",
      type: "enum",
      scope: "player",
      required: true,
      default: "外门弟子",
      enumValues: ["外门弟子", "内门弟子", "长老"],
    },
  ],
  narrativeRules: {
    mustFollow: ["以门派规矩约束叙事", "战斗力只能通过 schema 声明的属性变化"],
    mustAvoid: ["写成复杂战斗系统"],
    responseLengthHint: "short",
  },
};
