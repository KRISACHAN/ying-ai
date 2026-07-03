import {
  DefaultToolPlanningProvider,
  type ModelToolCall,
  type ToolPlan,
  type ToolPlanningInput,
  type ToolPlanningProvider,
} from "@ying-companion/ai-core";
import { WEB_SEARCH_TOOL_NAME } from "@ying-companion/tool-web-search";

export type DemoWebSearchPlannerMode =
  | "host-forced"
  | "explicit-intent"
  | "information-seeking"
  | "model-native"
  | "no-tool";

export interface DemoWebSearchPlanningProviderOptions {
  forceWebSearch?: boolean;
  modelSupportsNativeToolCalling: boolean;
}

const EXPLICIT_WEB_SEARCH_PATTERNS = [
  /联网\s*(搜索|查|查询|检索|找)/i,
  /网上\s*(搜索|搜|查|查询|检索|找)/i,
  /(?:帮我|请|麻烦)?\s*(搜索|搜一下|查一下|查查|查询|检索)/i,
  /\b(search|browse|look up|google|web search)\b/i,
];

/** 会话已开启联网时，事实/知识类问句也应触发搜索（不必写「搜索」）。 */
const INFORMATION_SEEKING_PATTERNS = [
  /(?:是什么|什么是|是啥|啥是|什么意思|指的是什么)[？?]?$/i,
  /(?:介绍一下|帮我了解|帮我科普)/i,
  /(?:有哪些|有什么|谁是|是谁|什么时候|何时|哪里|哪儿|多少|为什么|为何|如何|怎么|能不能|是否|是不是|真的吗)[？?]/i,
  /《[^》]{1,40}》/,
  /\b(what is|who is|when did|where is|how many|why did)\b/i,
];

const CASUAL_CHAT_PATTERNS = [
  /^(?:你好|嗨|哈喽|hello|hi|在吗|早上好|晚安|谢谢|辛苦了|抱抱|么么|想你了)/i,
  /陪我聊|聊聊天|好无聊|有点烦|不开心/,
];

export class DemoWebSearchPlanningProvider implements ToolPlanningProvider {
  public readonly meta = {
    id: "tool-planning.demo-web-search",
    kind: "tool-planning",
    name: "Demo Web Search Planning Provider",
  } as const;

  private readonly defaultPlanner = new DefaultToolPlanningProvider();
  private readonly forceWebSearch: boolean;
  private readonly modelSupportsNativeToolCalling: boolean;
  private lastMode: DemoWebSearchPlannerMode = "no-tool";

  public constructor(options: DemoWebSearchPlanningProviderOptions) {
    this.forceWebSearch = options.forceWebSearch === true;
    this.modelSupportsNativeToolCalling = options.modelSupportsNativeToolCalling;
  }

  public getLastMode(): DemoWebSearchPlannerMode {
    return this.lastMode;
  }

  public async plan(input: ToolPlanningInput): Promise<ToolPlan> {
    const hasWebSearch = Object.prototype.hasOwnProperty.call(input.tools, WEB_SEARCH_TOOL_NAME);
    const latestUserMessage = readLatestUserMessage(input.messages);

    if (hasWebSearch && this.forceWebSearch) {
      this.lastMode = "host-forced";
      return createWebSearchPlan(latestUserMessage);
    }

    if (hasWebSearch && hasExplicitWebSearchIntent(latestUserMessage)) {
      this.lastMode = "explicit-intent";
      return createWebSearchPlan(latestUserMessage);
    }

    if (hasWebSearch && hasInformationSeekingIntent(latestUserMessage)) {
      this.lastMode = "information-seeking";
      return createWebSearchPlan(latestUserMessage);
    }

    if (!this.modelSupportsNativeToolCalling) {
      this.lastMode = "no-tool";
      return {
        type: "no_tool",
        reason: Object.keys(input.tools).length === 0 ? "no_tools" : "tool_calling_unavailable",
      };
    }

    this.lastMode = "model-native";
    return this.defaultPlanner.plan(input);
  }
}

function createWebSearchPlan(query: string): ToolPlan {
  const call: ModelToolCall = {
    id: `demo-web-search-${Date.now().toString(36)}`,
    name: WEB_SEARCH_TOOL_NAME,
    arguments: { query: normalizeWebSearchQuery(query).slice(0, 400) },
  };

  return { type: "tool_calls", calls: [call] };
}

function normalizeWebSearchQuery(message: string): string {
  const normalized = message
    .replace(
      /^(?:帮我|请|麻烦你?|劳驾)?\s*(?:联网\s*)?(?:搜索|搜一下|查一下|查查|查询|检索)\s*/i,
      "",
    )
    .replace(/^(?:网上|网络上)\s*(?:搜索|搜|查|查询|检索|找)\s*/i, "")
    .replace(
      /(?:是什么|什么是|是啥|啥是|什么意思|指的是什么|介绍一下|帮我了解|帮我科普)[？?]?$/i,
      "",
    )
    .replace(/[？?。！!]+$/g, "")
    .trim();

  return normalized !== "" ? normalized : message.trim();
}

function readLatestUserMessage(messages: ToolPlanningInput["messages"]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role === "user" && message.content.trim() !== "") {
      return message.content.trim();
    }
  }

  return "";
}

function hasExplicitWebSearchIntent(message: string): boolean {
  return EXPLICIT_WEB_SEARCH_PATTERNS.some((pattern) => pattern.test(message));
}

function hasInformationSeekingIntent(message: string): boolean {
  const trimmed = message.trim();

  if (trimmed === "" || isCasualChat(trimmed)) {
    return false;
  }

  return INFORMATION_SEEKING_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function isCasualChat(message: string): boolean {
  return CASUAL_CHAT_PATTERNS.some((pattern) => pattern.test(message.trim()));
}
