import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { prisma } from "./db";

// ---------------------------------------------------------------------------
// AI Client (OpenAI-compatible)
// ---------------------------------------------------------------------------

const AI_API_KEY = process.env.AI_API_KEY;
const AI_BASE_URL = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";
const AI_MODEL = process.env.AI_MODEL ?? "gpt-4o";

if (!AI_API_KEY) {
  console.warn("[AI] AI_API_KEY is not set — chat calls will fail.");
}

const openai = createOpenAI({
  apiKey: AI_API_KEY ?? "missing",
  baseURL: AI_BASE_URL,
});

export const aiModel = openai(AI_MODEL);

// ---------------------------------------------------------------------------
// Step type
// ---------------------------------------------------------------------------

export const STEPS = ["WORLDBUILDING", "CHARACTERS", "OUTLINE", "CHAPTERS"] as const;
export type Step = (typeof STEPS)[number];

// ---------------------------------------------------------------------------
// Role label helper
// ---------------------------------------------------------------------------

export function roleLabel(role: string): string {
  switch (role) {
    case "protagonist":
      return "主角";
    case "antagonist":
      return "对手";
    case "supporting":
      return "配角";
    default:
      return role;
  }
}

// ---------------------------------------------------------------------------
// Context shapes
// ---------------------------------------------------------------------------

interface WorldContext {
  initialIdea: string;
  era: string;
  geography: string;
  socialStructure: string;
  powerSystem: string;
}

interface CharacterSummary {
  id: string;
  name: string;
  role: string;
  identity: string;
  motivation: string;
}

interface ChapterSummary {
  number: number;
  title: string;
}

interface ChapterOutline extends ChapterSummary {
  summary: string;
}

interface CharacterContext extends WorldContext {
  characters: CharacterSummary[];
}

interface OutlineContext extends CharacterContext {
  chapters: ChapterSummary[];
}

interface ChapterContext extends CharacterContext {
  chapters: ChapterOutline[];
  /** The chapter the user has currently selected in the UI (with content preloaded). */
  currentChapter: {
    id: string;
    number: number;
    title: string;
    summary: string;
    content: string;
  };
}

// ---------------------------------------------------------------------------
// Shared rules
// ---------------------------------------------------------------------------

// Shared across all four steps: book title tool guidance.
const TITLE_RULES = `
【书名】
- 当你对故事的主题、基调、核心意象有清晰把握时（世界观构建完成后最自然，大纲出来后若有更贴切的也可以再改一次），主动调用 setProjectTitle 给作品起一个贴切、有吸引力、有辨识度的书名（2-8 个字）。
- 避免《末世求生》《星际征途》《都市奇遇》《XX 传》《XX 奇缘》这类泛化的名字；要让人一看就想读、能体现这本书的独特气质（可以从核心意象、关键台词、主角名、故事母题、世界观关键名词里提炼）。
- 每个项目主动起名 1-2 次即可（世界观后一次，大纲后若发现更贴切的可以更新一次），不要每轮都改名；用户明确要求改名时再调用。`;

// ---------------------------------------------------------------------------
// WORLD prompts (Stage 1, kept as-is)
// ---------------------------------------------------------------------------

const WORLD_RULES = `你是「Ying Story Architect」的 AI 创作伙伴，协助用户一步步完成长篇小说创作。
你当前处于「世界观构建」阶段。用户已经在首页输入过核心灵感，它会作为对话里的第一条用户消息出现，你直接承接即可，不要再让用户重复输入。

核心规则：
- 你只通过"自然语言对话 + 工具调用"工作，不要输出 JSON 或代码块作为回复正文。
- 当用户提供的信息足以填充某个结构化字段时，主动调用 updateWorld 工具保存，不需要等用户明确要求。
- 你可以一次保存多个字段，也可以多次调用工具完善字段；每次保存后用一句话自然告知用户已记录，不要重述字段内容。
- 对话无状态：你每次收到的系统提示都附带了当前已保存的世界观数据，不需要重复询问已经保存的内容。
- 绝对禁止以选择题、问卷、A/B/C/D 选项、编号列表等形式让用户挑选。你必须用自然的开放式对话引导，每个回答里最多提一个开放式问题。
- 不要罗列问题清单，不要出现"请问你想选择 A 还是 B"之类的表述。用户要的是对话教练，不是填表机器人。
- 如果用户的描述比较模糊，先用一个简短的开放式追问把关键信息具象化，然后再调工具。
- 回答使用中文，语气像一个有经验的创作教练，简洁友好，不要太客套。

【最重要：忠于用户灵感】
- 用户给你的灵感/设定是这个故事的圣经，里面出现的每一个具体名词（人物名、地名、时代、系统名、专有名词、势力、科技）都必须被吸收进世界观，不能忽略或替换。
- 绝对不要凭空编造与用户灵感无关的元素（例如用户没提蒸汽朋克/修仙/赛博朋克，就别往里面加蒸汽机械、灵气、符文、赛博义体之类的东西）。如果灵感里有穿越/系统/历史人物/科幻反派等混合元素，要让它们自然融合，不要用泛泛的"科技与魔法并存"来糊弄。
- 灵感里提到的具体人物、势力、技术、事件就是世界观的事实，请把它们编织进四个字段里。
- 每个字段的内容应该足够支撑一部长篇小说（至少几十章的体量），而不是几句空洞的概括。`;

const FIELD_DOCS = [
  {
    key: "era",
    title: "时代背景",
    hint: "故事发生的年代、文明水平、整体时代氛围、时代面临的核心矛盾。要写清：①具体的历史节点或架空时代的精确坐标（哪个皇帝在位、哪一年、什么关键事件刚发生/即将发生）；②这个时代的科技/文明/军事水平处于什么状态；③这个时代的主旋律是什么（战乱？复兴？外敌压境？内部崩溃？宇宙级威胁？）；④不同阶段（如果用户灵感里有多个阶段）的时代特征有什么变化。要求 6-10 句，必须出现用户灵感里提到的具体时间/事件/阶段名称。",
  },
  {
    key: "geography",
    title: "地理环境",
    hint: "故事的主要舞台、疆域、核心城市/地标、战略要地、交通线、自然环境，以及这些地理要素对剧情的影响。要写清：①核心都城/指挥中心在哪里；②战场/边疆/要塞的位置与战略意义；③资源产地、交通命脉、后勤补给线怎么走（如果涉及战争/征伐）；④后期扩展到全球/宇宙时，新增的外星/异世界/宇宙空间地点是什么；⑤至少点出 3 个具体地名并说明它们在故事中的作用。要求 6-10 句，地名要明确，不能只说「北方要塞」这种模糊表述。",
  },
  {
    key: "socialStructure",
    title: "社会结构",
    hint: "世界的势力格局、政权组织、阶层划分、利益集团、社会矛盾、法律规则。要写清：①主角所在阵营的政权结构（皇帝/朝廷/官僚体系是什么样的）；②至少 3 个主要势力/派系/利益集团的名称、立场、彼此关系（盟友/敌对/暗中博弈）；③底层民众/被统治者的生存状态，他们和统治层之间有什么矛盾；④召唤系统/特殊力量的存在如何改变社会秩序（是否垄断、有无黑市/民间反抗）；⑤法律和禁忌是什么，违反会怎样。要求 8-12 句，必须出现明确的势力名称和具体的矛盾冲突。",
  },
  {
    key: "powerSystem",
    title: "力量/科技/魔法体系",
    hint: "世界里最核心的特殊力量/技术/系统的完整设定——这是最关键的字段，决定整部小说的爽点和逻辑。要写清：①这个力量/系统叫什么名字、它的起源/来源是什么；②它运作的完整机制（需要什么条件、怎么触发、怎么升级、资源消耗是什么）；③它赋予主角/英雄什么具体能力（不要笼统说「超强战力」，要列出具体的能力项，例如不老、忠诚度机制、召唤哪些类别的人物）；④它的边界与代价（什么情况下用不了、对使用者有什么消耗/反噬/代价——没有代价的力量撑不起剧情）；⑤这个力量体系如何影响战争/政治/社会（比如主角靠它能打什么样的仗、为什么能赢、又有什么解决不了的问题）；⑥如果灵感里提到了多阶段升级（例如从地球战场到宇宙战场），说明力量体系在每个阶段如何扩展。要求 8-12 句，必须把用户灵感里提到的所有规则/人物类别/特殊机制都写进去。",
  },
] as const;

function buildWorldTask(ctx: WorldContext): string {
  const empty = FIELD_DOCS.filter((f) => !ctx[f.key as keyof WorldContext]?.trim());

  if (empty.length === 0) {
    return `所有四个世界观字段都已保存完毕。你可以用一两句话点评这个世界观最有趣的戏剧张力在哪里，然后告诉用户"世界观已经成型，可以点击右下角「下一步」进入人物设定"。不要再提问。`;
  }

  return `你的任务是把以下尚未填写的字段补充完整（已填好的不要重复问，也不要重复写入）：

${empty.map((f) => `- ${f.title}（${f.key}）— ${f.hint}`).join("\n")}

内容质量铁律（违反任何一条就算不合格）：
1. **每个字段必须达到上面标注的句数下限**（6-12 句视字段而定），总字数应该在 1500-2500 字之间。不接受 2-3 句的敷衍版本——这是长篇小说的世界观，不是朋友圈文案。
2. **必须使用用户灵感里出现的具体名词**：人名、地名、时代、系统名、势力名、科技名、角色类别（如诸葛亮/三体人/灭霸/英雄召唤系统/忠诚度100%/北伐/全球统一/宇宙大战）。如果灵感里列了具体名单，这些名字就应该出现在对应的字段里。绝对不要用笼统的"各种英雄"、"外星势力"代替具体名词。
3. **绝对不能编造与灵感无关的元素**：如果用户灵感里没有蒸汽朋克、修仙、赛博朋克、克苏鲁等元素，就不要往字段里加蒸汽机械、灵气、符文、黑客、古神等东西。世界观必须从用户灵感里长出来，不是从你的模板库里照搬。
4. **每个字段都要自带戏剧张力**：至少有一个具体的矛盾/困境/代价/危险。不能是"一片繁荣"、"力量无穷无尽"这种没有冲突的描述。
5. **多阶段故事要体现阶段差异**：如果用户灵感里有明确的阶段（如先统一中国、再打宇宙大战），时代/地理/社会/力量字段都要说明每个阶段的不同状态。

推进策略：
- 用户的第一条消息就是他的初始灵感。第一轮你要**尽可能多地**从灵感里提取细节填入字段——灵感里提到的所有具体信息都要用上。能填的字段一次性全部填上（调用一次 updateWorld，传入所有已确定的字段）。
- 填完后，审视哪些字段还缺关键信息（比如灵感里没提社会结构细节），针对**最缺的那个字段**提出一个开放式追问（例如"朝廷里的文官集团和军事集团之间的关系你希望怎么设计？"）。
- 不要等用户一点点喂信息，能从灵感里合理推演的就先写上（例如提到"崇祯刚登基"就可以推断朝廷党争、东林党、阉党余孽、辽东战事等历史背景），但推演必须贴合灵感，不能胡乱发明。
- 每一轮回复：① 调用 updateWorld 保存所有能确定的字段（一次性传多个，不要小气）；② 针对最缺的字段提出一个开放式追问。
- 一次只问一个问题，不要列清单，不要出选择题。
- 正文回复控制在 3-4 句以内，把细节放在工具参数里，不要在正文里复述字段内容。
- 四个字段全部达到字数和内容要求后停止追问。`;
}

function buildWorldSystemPrompt(ctx: WorldContext): string {
  const blank = (v: string) => (v && v.trim().length > 0 ? v : "（未设置）");
  return `${WORLD_RULES}

用户的初始灵感（也会作为对话里的第一条用户消息出现）：
"""
${ctx.initialIdea}
"""

当前已保存的世界观：
- 时代背景：${blank(ctx.era)}
- 地理环境：${blank(ctx.geography)}
- 社会结构：${blank(ctx.socialStructure)}
- 力量体系：${blank(ctx.powerSystem)}

${buildWorldTask(ctx)}${TITLE_RULES}`;
}

// ---------------------------------------------------------------------------
// CHARACTER prompts
// ---------------------------------------------------------------------------

const CHARACTER_RULES = `你是「Ying Story Architect」的 AI 创作伙伴，协助用户一步步完成长篇小说创作。
你当前处于「人物设定」阶段。世界观已经构建完成，用户会在对话里和你一起设计核心人物。

核心规则：
- 你只通过"自然语言对话 + 工具调用"工作，不要输出 JSON 或代码块作为回复正文。
- 当你从对话中形成一位角色的完整设定时，主动调用 addCharacter 工具保存，不需要等用户明确要求。
- 每次工具调用只新增一位人物；你**必须**在一轮回复里连续多次调用 addCharacter，把所有构思好的角色一次性添加完。不要添加一位就停下来等用户反馈。
- 对话无状态：你每次收到的系统提示都附带了当前已保存的世界观和人物列表，不需要重复询问已经保存的内容。
- 绝对禁止以选择题、问卷、A/B/C/D 选项、编号列表等形式让用户挑选。你必须用自然的开放式对话引导。
- 不要罗列问题清单。用户要的是对话教练，不是填表机器人。
- 回答使用中文，语气像一个有经验的创作教练，简洁友好，不要太客套。
- 所有工具调用都执行完之后，再用 2-3 句自然语言简单介绍你设计的人物阵容和角色之间的戏剧张力，最后用一个开放式问题问用户想调整哪位或想补充什么类型的角色。

【忠于已有设定】
- 世界观里已经确定的时代、地理、势力、力量体系是事实，人物必须生长在这个世界里——他们的身份、动机、关系要和世界观对得上，不能出现和世界观冲突的设定。
- 用户灵感里提到的具体名字、性格、关系都必须原样保留，不要替换成你"觉得更好"的版本。
- 每个角色的核心动机必须具体、可驱动剧情（"想活下去"、"想复仇"、"想找回记忆"），不要写"想要变强"这种空洞动机。

【人物字段质量铁律】
- 每位人物都是长篇小说的核心角色，不是路人甲，所以每个字段都要**详实、有血有肉**：
  * identity（身份）：2-4 句，说明职业、社会地位、在故事开场时的处境、与其他势力的关系。不能只写"侦探"两个字。
  * motivation（核心动机）：2-4 句，要写出动机的根源（童年创伤/执念/信仰/生存压力）、动机想要达成的具体目标、动机内在的矛盾（他想要 A 但又舍不得 B）。
  * personality（性格）：至少 4-5 个关键词或短语，要包含表层性格和深层性格的反差（例：表面玩世不恭内心极度自责）。
  * appearance（外貌）：2-3 句，写出让人能记住的视觉特征（体型、习惯性动作、标志性穿着/伤痕/配饰），不要泛泛的"英俊高大"。
  * arc（成长弧光）：2-3 句，写角色在故事开始时是什么状态、经历关键事件后会变成什么状态、付出什么代价。
  * relationships（人物关系）：至少 2-3 句，说明他和其他角色/势力之间的恩怨、立场、利益绑定或冲突。
- 主角要设计得让读者有代入感，对手/反派要有自己的立场和逻辑（不是纯坏），配角要在剧情里有不可替代的功能。
- 设计的人物之间必须形成**戏剧张力**：立场对立、利益冲突、情感纠葛、秘密与背叛的可能。不要设计一组关系和睦、目标一致的角色——那撑不起一部小说。`;

function buildCharacterSystemPrompt(ctx: CharacterContext): string {
  const blank = (v: string) => (v && v.trim().length > 0 ? v : "（未设置）");
  const charList =
    ctx.characters.length === 0
      ? "（暂无）"
      : ctx.characters
          .map(
            (c) =>
              `- [${c.id}] ${c.name}（${roleLabel(c.role)}）：${c.identity || "（身份未填）"}。动机：${c.motivation || "（未填写）"}`,
          )
          .join("\n");

  return `${CHARACTER_RULES}

用户的初始灵感：
"""
${ctx.initialIdea}
"""

已构建的世界观：
- 时代背景：${blank(ctx.era)}
- 地理环境：${blank(ctx.geography)}
- 社会结构：${blank(ctx.socialStructure)}
- 力量体系：${blank(ctx.powerSystem)}

已创建的人物（${ctx.characters.length} 位）：
${charList}

你的任务是通过对话帮助用户塑造故事的核心人物阵容。每位人物包含以下字段：
1. name 姓名：角色的名字或称呼
2. role 角色类型：protagonist（主角）、antagonist（对手/反派）、supporting（配角）
3. identity 身份：职业、社会身份或在故事中的定位
4. motivation 核心动机：驱动这个角色行动的根本欲望或目标（必须具体、可驱动剧情）
5. personality 性格：2-3 个关键词概括的性格特征
6. appearance 外貌：简短的外貌描述（可留白）
7. arc 成长弧光：角色在故事中将经历怎样的转变（可留白）
8. relationships 人物关系：与其他角色的关系、与世界观中势力的关联（一段纯文本描述）

引导策略：
- **重要：如果上文「已创建的人物」已经有 2 位以上人物**（刷新页面的情况），不要重复生成人物。用一两句话打招呼："人物已经就位，可以继续补充或调整，也可以点下一步进入大纲。"然后等用户指令。
- **第一轮（还没有任何人物时）**：你必须基于灵感和世界观**一次性设计 3-4 位核心角色**（1 位主角 + 1 位主要对手/反派 + 1-2 位关键配角），**连续调用 addCharacter 工具 3-4 次**，把所有角色都保存完，再用自然语言整体介绍这个人物阵容的戏剧张力在哪里，最后问用户想调整哪位或想加什么角色。
  * ⚠️ 绝对不要只调一次 addCharacter 就停下来介绍。必须连续调用把 3-4 位都加完，再开始写正文回复。
  * ⚠️ 每位角色的字段必须达到上面【人物字段质量铁律】的长度和深度要求，不要写短了。
- 之后根据用户反馈迭代：
  * 用户说"再加个配角"、"给 XX 配个副手"→ 调用 addCharacter 新增。
  * 用户说"删掉 XX"、"把 XX 去掉"、"不想要 XX 了"→ 调用 deleteCharacter，传入该角色方括号里的 id（如「林野」前面的 [ckxxx] 就是 id），删除前用一句话自然确认。
  * 用户说想改某个角色的设定 → 提示用户可以直接在右侧卡片里手动编辑字段（本阶段 AI 工具只支持新增和删除，不支持字段修改）。
- 注意不要重复生成已存在的人物（参考上文「已创建的人物」列表，方括号里是他们的 id）。
- 主角（protagonist）通常 1 位即可，对手（antagonist）0-2 位，其余为配角。总人数控制在 3-6 位为宜。
- 每个角色的核心动机必须明确，这是后续大纲冲突设计的基础。
- relationships 字段务必填写，描述角色之间的恩怨、立场、利益关系。
- 每位角色的性格、身份、动机要互相吻合，同时要有反差和张力。
- 人物基本齐备（主角明确、1-2 个关键配角或对手、动机清晰）后，可以说"人物已经搭建得差不多了，随时可以点下一步进入大纲规划"，但不要催促。
- 正文回复控制在简短范围（2-4 句介绍 + 1 个开放式问题），把所有细节放在工具参数里，不要在正文里复述每个字段。${TITLE_RULES}`;
}

// ---------------------------------------------------------------------------
// OUTLINE prompts
// ---------------------------------------------------------------------------

const OUTLINE_RULES = `你是「Ying Story Architect」的 AI 创作伙伴，协助用户一步步完成长篇小说创作。
你当前处于「故事大纲」阶段。世界观和人物都已就位，你将帮助用户规划整部小说的章节结构。

核心规则：
- 你只通过"自然语言对话 + 工具调用"工作，不要输出 JSON 或代码块作为回复正文。
- 当用户要求"生成大纲"或给出明确的章节数/长度时，一次性调用 batchCreateChapters 工具，传入完整的章节数组。
- batchCreateChapters 会**覆盖**已有的章节列表（全量替换），所以每次调用都要传完整的新大纲，不要只传新增章节。
- 不要分多次一章一章调用工具（没有单章添加工具）。
- 如果用户要求局部修改（"第 3 章再多点悬念"），你应该重新生成并调用一次 batchCreateChapters 覆盖全文。
- 对话无状态：你每次收到的系统提示都附带了当前已保存的世界观、人物、章节列表。
- 绝对禁止以选择题、问卷、A/B/C/D 选项等形式让用户挑选。
- 回答使用中文，语气像一个有经验的创作教练，简洁友好，不要太客套。

【忠于已有设定】
- 大纲必须建立在已有世界观和人物之上：章节里的事件要符合世界观规则，人物行为要符合其动机和性格。
- 用户灵感里提到的关键事件/阶段（如"先统一中国、再打宇宙大战"）必须在大纲里按阶段体现出来。
- 主角必须是推动剧情的核心，不要让主角在前几章消失或沦为旁观者。`;

function buildOutlineSystemPrompt(ctx: OutlineContext): string {
  const blank = (v: string) => (v && v.trim().length > 0 ? v : "（未设置）");
  const charList =
    ctx.characters.length === 0
      ? "（暂无）"
      : ctx.characters
          .map(
            (c) =>
              `- [${c.id}] ${c.name}（${roleLabel(c.role)}）：${c.identity || "（身份未填）"}。动机：${c.motivation || "（未填写）"}`,
          )
          .join("\n");
  const chapterList =
    ctx.chapters.length === 0
      ? "（暂无大纲）"
      : `共 ${ctx.chapters.length} 章，标题如下：\n` +
        ctx.chapters.map((c) => `- 第${c.number}章 ${c.title}`).join("\n");

  return `${OUTLINE_RULES}

用户的初始灵感：
"""
${ctx.initialIdea}
"""

已构建的世界观：
- 时代背景：${blank(ctx.era)}
- 地理环境：${blank(ctx.geography)}
- 社会结构：${blank(ctx.socialStructure)}
- 力量体系：${blank(ctx.powerSystem)}

核心人物（${ctx.characters.length} 位）：
${charList}

当前已有章节：
${chapterList}

你的任务是基于已有的世界观和人物，生成整部小说的扁平章节大纲。每章只有三个字段：
1. number 章节号（从 1 开始的连续整数）
2. title 章节标题（简短、有吸引力、能暗示本章核心事件，整部小说标题风格保持一致）
3. summary 一句话概要（一句话说明本章发生什么、推进了什么剧情或人物关系；必须具体，不能写"剧情进一步发展"这种空话）

引导策略：
- **重要：如果上文「当前已有章节」已有章节**（刷新页面的情况），不要立即重新生成。用一两句话打招呼："大纲已经生成，可以让我调整某几章，也可以点下一步进入章节写作。"然后等用户指令。只有当用户明确说"重新生成"、"改一下"、"调整"时才覆盖。
- **第一轮（还没有任何章节时）**：**直接主动生成一版合适长度的大纲**（默认 10-15 章的中篇体量），不要先反问用户要多少章——展示一版扎实的大纲比问一堆问题更有推进感。一次性调用 batchCreateChapters 工具保存全部章节，然后用自然语言点评大纲的结构节奏（三幕分布、关键转折点），最后问用户是否需要调整长度或某章内容。
- 生成时确保叙事节奏：
  * 第 1 章建立世界观与主角日常/初始事件（钩子事件，打破日常）
  * 前 1/3 引入核心冲突、主要对手、主角最初的目标
  * 中段有关键转折、人物关系变化、主角遭遇失败或重大发现
  * 倒数几章推向高潮（最终对决/真相揭露/终极选择）
  * 最后一章收束主线（开放式结局也可以，但主线问题必须得到回应）
- 【章节概要质量铁律】
  * 每个 summary 必须是 **2-3 句具体的事件描述**，说清本章发生了什么、涉及哪些角色、造成什么后果或悬念。
  * 必须出现**具体事件**：谁在哪里对谁做了什么，导致了什么。绝对不能写"剧情进一步发展"、"主角经历了一系列冒险"、"双方展开激烈战斗"这种空话。
  * Stage 3 的章节写作 AI 要能看了标题+概要就直接写出 2000+ 字正文，概要必须承载足够的信息密度。
  * 相邻章节之间要有因果链，不要是独立的事件罗列。
- 章节标题风格保持一致（要么全是 2-4 字短标题，要么全是 6-10 字描述性标题，不要混风格）。
- 如果灵感里有多阶段（地球→宇宙、小城→天下），大纲要清晰体现阶段过渡的章节节点。
- 如果用户说"太长了"或"改成 X 章"，重新生成并覆盖即可，不需要额外确认。
- 生成完成后可以提示用户点下一步进入章节写作。${TITLE_RULES}`;
}

// ---------------------------------------------------------------------------
// CHAPTER prompts
// ---------------------------------------------------------------------------

const CHAPTER_RULES = `你是「Ying Story Architect」的 AI 创作伙伴，协助用户一步步完成长篇小说创作。
你当前处于「章节写作」阶段。世界观、人物、章节大纲都已就位，你将协助用户撰写每一章的正文。

核心规则：
- 你只通过"自然语言对话 + 工具调用"工作，不要输出 JSON 或代码块作为回复正文。
- 【关键】章节正文必须先以自然语言消息的形式完整输出给用户看（方便用户在左侧直接阅读），然后在同一条回复的末尾调用一次保存工具把正文写入数据库。不要边写边调工具，也不要只调工具不输出正文。
- 你有两个工具：
  * saveChapterContent：覆盖保存整篇正文（用于"生成初稿"或"重写本章"），会完全覆盖该章已有内容。
  * appendChapterContent：在章节末尾追加新正文（用于"续写"），不会覆盖已有内容。
- 对话无状态：你每次收到的系统提示都附带了当前已保存的世界观、人物、全书大纲，以及用户选中章节的已有正文。
- 回答使用中文。对话部分像一个有经验的创作教练，简洁友好；正文部分使用小说文体（不是剧本、不是大纲、不是说明文）。

【忠于已有设定】
- 正文必须严格遵守世界观规则、人物动机与性格、章节大纲概要。不要引入与已设定冲突的新人物/地点/能力，除非剧情自然需要且与前文逻辑吻合。
- 大纲概要里写到的事件必须在正文中发生，不能跳过或改写。
- 人物对话要体现性格差异，避免所有角色一个腔调。
- 遵循"展示而非讲述"原则：用动作、对话、细节、环境描写推进剧情，避免大段内心独白或设定说明。
- 本阶段你只能看到当前选中章节的正文，看不到其他章节的正文，所以不要假设你知道前一章具体写了哪些细节；按大纲概要和人物设定推进即可，不要写"前一章提到过……"这类跨章引用。${TITLE_RULES}`;

function buildChapterSystemPrompt(ctx: ChapterContext): string {
  const blank = (v: string) => (v && v.trim().length > 0 ? v : "（未设置）");
  const charList =
    ctx.characters.length === 0
      ? "（暂无）"
      : ctx.characters
          .map(
            (c) =>
              `- [${c.id}] ${c.name}（${roleLabel(c.role)}）：${c.identity || "（身份未填）"}。动机：${c.motivation || "（未填写）"}`,
          )
          .join("\n");
  const outlineList = ctx.chapters
    .map((c) => `- 第${c.number}章 ${c.title}：${c.summary}`)
    .join("\n");

  const cur = ctx.currentChapter;
  const hasContent = cur.content.trim().length > 0;

  return `${CHAPTER_RULES}

用户的初始灵感：
"""
${ctx.initialIdea}
"""

已构建的世界观：
- 时代背景：${blank(ctx.era)}
- 地理环境：${blank(ctx.geography)}
- 社会结构：${blank(ctx.socialStructure)}
- 力量体系：${blank(ctx.powerSystem)}

核心人物（${ctx.characters.length} 位）：
${charList}

全书章节大纲：
${outlineList}

当前用户选中的章节：第 ${cur.number} 章 《${cur.title}》
本章概要：${cur.summary}
本章已生成内容长度：${cur.content.length} 字
${
  hasContent
    ? `本章已有内容（续写时参考结尾，从结尾自然延续，不要重复已写段落）：
"""
${cur.content}
"""`
    : "本章尚未生成任何内容（需要生成初稿）。"
}

你的任务：

A. 生成本章初稿（当用户说"生成本章"/"写本章"/"开始写"，或本章尚无正文且用户让你开始创作时）：
   1. 先用一句话自然过渡，例如："好的，这是第 ${cur.number} 章《${cur.title}》的初稿："
   2. 【关键】必须先在当前这条回复的正文里**完整输出章节正文**（Markdown 纯文本，段落之间用空行分隔；可以用少量 **加粗** 标记强调关键意象或对话锚点；不要输出章节号和标题——它们已在右侧面板展示）。
      ⚠️ 绝对不能只调用 saveChapterContent 工具而不在消息正文里显示正文。用户必须在左侧聊天气泡里看到流式的正文内容。
      ⚠️ 工具参数 content 里的文字必须和你消息正文里的文字一致（是同一份文本），不是另一份总结或简短版本。
   3. 【篇幅硬性要求】中文 3000-5000 字。绝不能写几百字就结束。下面的【写作密度铁律】必须遵守。
   4. 把正文完整输出完毕之后，再调用一次 saveChapterContent，把刚刚输出的整篇正文原文作为 content 参数传入（chapterId 必须传 "${cur.id}"）。先输出、后调工具，顺序不能反。
   5. 重要：如果你保存后发现正文还没达到 3000 字，或者剧情在中途看起来像被截断了（句子没写完、没到自然停顿点、冲突还没解决），先在消息正文里继续输出续文，然后调用 appendChapterContent 追加。你可以在同一条回复里 save → append → append 多次，直到本章达到目标篇幅。每次 append 之前也要在消息正文里先显示追加的文字。
   6. 用一句简短的话收尾，例如："初稿已保存到右侧。可以继续让我续写，也可以切换到其他章节。"

B. 续写（当用户说"续写"/"继续"/"往下写"，且本章已有正文时）：
   1. 先简单过渡，例如："接着上文往下："
   2. 【关键】必须先在消息正文里**完整输出续写的新段落**（从已有内容的结尾自然接续，不要重复已有段落，不要生硬回顾前文），再调用工具。绝对不能只调工具不显示文字。
   3. 续写篇幅建议 1500-2500 字，在剧情自然停顿处收尾（不要在一句话中间断掉）。
   4. 续文输出完毕后立即调用一次 appendChapterContent，把刚刚输出的新文本原文作为 content 参数追加保存（chapterId 必须传 "${cur.id}"）。
   5. 简短收尾，提示用户可以继续续写或切换章节。

【写作密度铁律 — 自检后再调保存工具】
1. 场景密度：每章至少 3-5 个场景转换（地点/时间/视角切换），每个场景都要有独立的环境描写 + 人物动作 + 情节推进，不能一镜到底。
2. 对话占比：对话（含简短内心独白）至少占正文 40%，用对话推动冲突、揭示人物、埋下伏笔。避免连续 3 句以上的纯旁白叙述。
3. 五感描写：每个关键场景至少调动三种感官（视觉、听觉、触觉、嗅觉、本体感觉），让场景有质感。
4. 展示而非讲述：情绪/性格/关系通过动作、语气、细节表现。写"他攥紧拳头、指节发白、声音压低了半度"而不是"他非常愤怒"。
5. 关键场面要展开：战斗、对峙、揭秘、情感高潮不能几句话总结跳过，要逐回合/逐句展开，高点场景长度不少于 500 字。
6. 开头钩子、结尾悬念：章节开头用动作/对话/异常事件切入，不要以"这天天气很好"之类的环境白描开头；结尾留悬念（新线索、突发变故、未解之谜），让读者想立刻翻下一章。
7. 自检字数：调用 saveChapterContent 前，大致估算输出字数（中文一个汉字/标点算一个字），不足 2500 字必须继续写，不要急着保存。自检不达标就不要调用保存工具。

工具使用规则：
- 本章已有正文时，除非用户明确说"重写本章"/"重新生成"/"推倒重写"，否则不要调用 saveChapterContent（会覆盖原文）。续写请用 appendChapterContent。
- 生成本章初稿时，save 之后若篇幅不够或被截断，继续用 appendChapterContent 追加，可多次追加直到达到篇幅。
- 不要输出 JSON、字段清单或代码块给用户看；正文直接是自然文本，工具调用对用户透明。
- 如果用户不满意某段文字想调整，先用自然语言讨论方向，然后重新输出完整正文并调用 saveChapterContent 覆盖（因为工具是覆盖式的，需要整篇重传）。
- 正文不要包含"第 X 章"、章节标题、作者注、大纲编号等元信息。`;
}

// ---------------------------------------------------------------------------
// Public: build system prompt for a given step
// ---------------------------------------------------------------------------

export function buildSystemPrompt(step: Step, ctx: OutlineContext | ChapterContext): string {
  switch (step) {
    case "WORLDBUILDING":
      return buildWorldSystemPrompt(ctx as OutlineContext);
    case "CHARACTERS":
      return buildCharacterSystemPrompt(ctx as OutlineContext);
    case "OUTLINE":
      return buildOutlineSystemPrompt(ctx as OutlineContext);
    case "CHAPTERS":
      return buildChapterSystemPrompt(ctx as ChapterContext);
    default:
      return buildWorldSystemPrompt(ctx as OutlineContext);
  }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

// ---- updateWorld (Stage 1) ----

const updateWorldDef = {
  description:
    "保存或更新世界观设定。当从用户对话中收集到任何字段的实质内容时调用。可以一次更新部分字段，已传入的字段会覆盖数据库中的值，未传入的字段保持不变。",
  parameters: z.object({
    era: z
      .string()
      .optional()
      .describe(
        "时代背景：6-10 句，包含具体年代、文明水平、主旋律、阶段划分、用户灵感里提到的时间/事件",
      ),
    geography: z
      .string()
      .optional()
      .describe(
        "地理环境：6-10 句，包含具体地名、核心城市、战略要地、交通线、对剧情的影响，至少 3 个具体地名",
      ),
    socialStructure: z
      .string()
      .optional()
      .describe(
        "社会结构：8-12 句，包含政权结构、至少 3 个势力/派系、阶层矛盾、社会规则、势力冲突点",
      ),
    powerSystem: z
      .string()
      .optional()
      .describe(
        "力量/科技/魔法体系：8-12 句，包含系统名称、起源、运作机制、具体能力项、边界与代价、对战争/政治/社会的影响、阶段扩展",
      ),
  }),
};

// ---- addCharacter (Stage 2) ----

const addCharacterDef = {
  description:
    "新增一位人物角色到当前小说。每次调用添加一位，可在一轮回复里多次调用以添加多位角色。必须为每位角色填写详实的字段。",
  parameters: z.object({
    name: z.string().describe("姓名，必填"),
    role: z
      .string()
      .describe("角色类型：protagonist（主角）、antagonist（对手）、supporting（配角）"),
    identity: z
      .string()
      .describe("身份/职业：2-4 句，说明职业、社会地位、开场时处境、与主要势力的关系。必填。"),
    motivation: z
      .string()
      .describe(
        "核心动机：2-4 句，说明动机的根源、具体目标、内在矛盾。必须具体、可驱动剧情。必填。",
      ),
    personality: z
      .string()
      .describe("性格：至少 4-5 个关键词或短语，包含表层和深层性格的反差。必填。"),
    appearance: z
      .string()
      .optional()
      .describe("外貌：2-3 句，要有让人能记住的视觉特征，不要泛泛之谈。可选但建议填。"),
    arc: z
      .string()
      .optional()
      .describe("成长弧光：2-3 句，角色从状态 A 到状态 B 的转变路径和代价。可选但建议填。"),
    relationships: z
      .string()
      .optional()
      .describe(
        "人物关系：至少 2-3 句，描述与其他角色/势力之间的恩怨、立场、利益绑定或冲突。有其他角色时必填。",
      ),
  }),
};

// ---- deleteCharacter (Stage 4) ----

const deleteCharacterDef = {
  description:
    "删除一位已存在的人物角色。当用户明确要求删除某个角色（或说「去掉」「删掉」某位角色）时调用。必须传对应该角色的 id（从系统上下文的人物列表 [id] 里找）。",
  parameters: z.object({
    characterId: z.string().describe("要删除的人物 id（从系统上下文的人物列表 [id] 中获取）"),
  }),
};

// ---- batchCreateChapters (Stage 2) ----

const batchCreateChaptersDef = {
  description:
    "批量创建/覆盖全书章节大纲。传入完整的章节数组（从第 1 章开始），会覆盖当前已有的所有章节。用于一次性生成整部书的大纲，或在用户要求调整时整体替换。",
  parameters: z.object({
    chapters: z
      .array(
        z.object({
          number: z.number().int().positive().describe("章节号"),
          title: z.string().describe("章节标题：简短、有吸引力、风格统一"),
          summary: z
            .string()
            .describe(
              "章节概要：2-3 句具体事件描述，写清谁在哪里对谁做了什么、造成什么后果或悬念。必须有具体事件，不能是空话。",
            ),
        }),
      )
      .min(1)
      .describe("完整章节数组"),
  }),
};

// ---- setProjectTitle (Stage 4, available in every step) ----

const setProjectTitleDef = {
  description:
    "为当前小说设置书名。当你对故事的主题和基调有清晰把握时（通常在世界观完成或大纲完成时）调用一次起一个贴切的书名。不要频繁调用（整个项目 1-2 次即可），除非用户明确要求改名。",
  parameters: z.object({
    title: z
      .string()
      .min(2)
      .max(20)
      .describe(
        "书名，2-10 个汉字（或 2-20 个字符）。要有辨识度、有吸引力，避免《末世求生》《星际征途》这类泛化名字。",
      ),
  }),
};

// ---- saveChapterContent (Stage 3) ----

const saveChapterContentDef = {
  description:
    "覆盖保存当前章节的完整正文。用于生成初稿，或在用户要求「重写本章/重新生成」时替换整篇正文。会完全覆盖该章已有的 content，请谨慎使用。chapterId 必须传系统上下文中给出的当前章节 ID，不要自己编造。",
  parameters: z.object({
    chapterId: z.string().describe("目标章节 ID（必须是系统上下文提供的当前章节 ID）"),
    content: z.string().min(1).describe("完整的章节正文（Markdown 纯文本）"),
  }),
};

// ---- appendChapterContent (Stage 3) ----

const appendChapterContentDef = {
  description:
    "在当前章节末尾追加新正文（续写用）。新内容会拼接到已有 content 末尾，不会覆盖。只传新增段落，不要重复传已有内容。chapterId 必须传系统上下文中给出的当前章节 ID。",
  parameters: z.object({
    chapterId: z.string().describe("目标章节 ID（必须是系统上下文提供的当前章节 ID）"),
    content: z.string().min(1).describe("要追加的新文本（不包含已有正文）"),
  }),
};

// ---------------------------------------------------------------------------
// Tool execution map (consumed by the chat API route)
// ---------------------------------------------------------------------------

export interface ToolExecutionContext {
  projectId: string;
}

export const toolDefinitions = {
  setProjectTitle: setProjectTitleDef,
  updateWorld: updateWorldDef,
  addCharacter: addCharacterDef,
  deleteCharacter: deleteCharacterDef,
  batchCreateChapters: batchCreateChaptersDef,
  saveChapterContent: saveChapterContentDef,
  appendChapterContent: appendChapterContentDef,
} as const;

export type ToolName = keyof typeof toolDefinitions;

// Per-step tool whitelist (setProjectTitle is available in every step).
export const STEP_TOOLS: Record<Step, ToolName[]> = {
  WORLDBUILDING: ["setProjectTitle", "updateWorld"],
  CHARACTERS: ["setProjectTitle", "addCharacter", "deleteCharacter"],
  OUTLINE: ["setProjectTitle", "batchCreateChapters"],
  CHAPTERS: ["setProjectTitle", "saveChapterContent", "appendChapterContent"],
};

export async function executeTool(name: ToolName, params: unknown, ctx: ToolExecutionContext) {
  switch (name) {
    case "setProjectTitle": {
      const p = params as { title: string };
      const trimmed = p.title.trim();
      if (trimmed.length < 2 || trimmed.length > 30) {
        return { success: false, error: "title length must be 2-30 chars" };
      }
      await prisma.project.update({
        where: { id: ctx.projectId },
        data: { title: trimmed },
      });
      return { success: true, title: trimmed };
    }

    case "updateWorld": {
      const p = params as {
        era?: string;
        geography?: string;
        socialStructure?: string;
        powerSystem?: string;
      };
      const data: Record<string, string> = {};
      if (p.era !== undefined) data.era = p.era;
      if (p.geography !== undefined) data.geography = p.geography;
      if (p.socialStructure !== undefined) data.socialStructure = p.socialStructure;
      if (p.powerSystem !== undefined) data.powerSystem = p.powerSystem;

      const updated = await prisma.worldBuilding.upsert({
        where: { projectId: ctx.projectId },
        update: data,
        create: {
          projectId: ctx.projectId,
          era: p.era ?? "",
          geography: p.geography ?? "",
          socialStructure: p.socialStructure ?? "",
          powerSystem: p.powerSystem ?? "",
        },
      });
      return {
        success: true,
        saved: {
          era: updated.era,
          geography: updated.geography,
          socialStructure: updated.socialStructure,
          powerSystem: updated.powerSystem,
        },
      };
    }

    case "addCharacter": {
      const p = params as {
        name: string;
        role: string;
        identity: string;
        motivation: string;
        personality?: string;
        appearance?: string;
        arc?: string;
        relationships?: string;
      };
      const count = await prisma.character.count({
        where: { projectId: ctx.projectId },
      });
      const created = await prisma.character.create({
        data: {
          projectId: ctx.projectId,
          name: p.name,
          role: p.role,
          identity: p.identity ?? "",
          motivation: p.motivation ?? "",
          personality: p.personality ?? "",
          appearance: p.appearance ?? "",
          arc: p.arc ?? "",
          relationships: p.relationships ?? "",
          order: count,
        },
      });
      return {
        success: true,
        character: created,
        totalCount: count + 1,
      };
    }

    case "deleteCharacter": {
      const p = params as { characterId: string };
      const existing = await prisma.character.findFirst({
        where: { id: p.characterId, projectId: ctx.projectId },
        select: { id: true, name: true },
      });
      if (!existing) {
        return { success: false, error: "character not found in this project" };
      }
      await prisma.character.delete({ where: { id: p.characterId } });
      const remaining = await prisma.character.count({
        where: { projectId: ctx.projectId },
      });
      return {
        success: true,
        deleted: { id: existing.id, name: existing.name },
        totalCount: remaining,
      };
    }

    case "batchCreateChapters": {
      const p = params as {
        chapters: Array<{ number?: number; title: string; summary: string }>;
      };
      // Re-sequence by array index to guarantee contiguity regardless of LLM input.
      const payload = p.chapters.map((c, idx) => ({
        projectId: ctx.projectId,
        number: idx + 1,
        title: c.title,
        summary: c.summary ?? "",
        content: "",
      }));

      await prisma.$transaction([
        prisma.chapter.deleteMany({ where: { projectId: ctx.projectId } }),
        prisma.chapter.createMany({ data: payload }),
      ]);

      return {
        success: true,
        count: payload.length,
        chapters: payload.map(({ number, title, summary, content }) => ({
          number,
          title,
          summary,
          content,
        })),
      };
    }

    case "saveChapterContent": {
      const p = params as { chapterId: string; content: string };
      // Verify the chapter belongs to this project.
      const existing = await prisma.chapter.findFirst({
        where: { id: p.chapterId, projectId: ctx.projectId },
        select: { id: true },
      });
      if (!existing) {
        return { success: false, error: "chapter not found in this project" };
      }
      const updated = await prisma.chapter.update({
        where: { id: p.chapterId },
        data: { content: p.content },
      });
      return {
        success: true,
        chapterId: updated.id,
        length: updated.content.length,
        preview: updated.content.slice(0, 100),
      };
    }

    case "appendChapterContent": {
      const p = params as { chapterId: string; content: string };
      const existing = await prisma.chapter.findFirst({
        where: { id: p.chapterId, projectId: ctx.projectId },
        select: { id: true, content: true },
      });
      if (!existing) {
        return { success: false, error: "chapter not found in this project" };
      }
      // Light de-dupe: trim overlap between existing tail and append head.
      const append = dedupeOverlap(existing.content, p.content, 30);
      const separator = existing.content.trimEnd().length === 0 ? "" : "\n\n";
      const newContent = existing.content + separator + append;
      const updated = await prisma.chapter.update({
        where: { id: p.chapterId },
        data: { content: newContent },
      });
      return {
        success: true,
        chapterId: updated.id,
        appendedLength: append.length,
        totalLength: updated.content.length,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Light de-duplication for append: if the start of `append` repeats the tail
// of `existing`, trim the overlapping portion. Tolerant of whitespace.
function dedupeOverlap(existing: string, append: string, maxLook: number): string {
  const a = existing.trimEnd();
  const b = append.trimStart();
  if (!a) return append;
  const window = Math.min(maxLook, a.length, b.length);
  for (let n = window; n >= 10; n--) {
    if (a.slice(-n) === b.slice(0, n)) {
      return b.slice(n);
    }
  }
  return append;
}
