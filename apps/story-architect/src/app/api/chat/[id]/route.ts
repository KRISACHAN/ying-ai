import { convertToModelMessages, isStepCount, streamText, type ToolSet, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  aiModel,
  buildSystemPrompt,
  executeTool,
  STEP_TOOLS,
  toolDefinitions,
  type Step,
  type ToolName,
} from "@/lib/ai";

export const maxDuration = 60;

const chatSchema = z.object({
  messages: z.array(z.unknown()),
  step: z.enum(["WORLDBUILDING", "CHARACTERS", "OUTLINE", "CHAPTERS"]),
  currentChapterId: z.string().optional(),
});

// Normalize incoming messages (which may come in various shapes: raw core
// messages, or UI messages with/without `parts`) into full UIMessage objects.
function toUIMessages(raw: unknown[]): UIMessage[] {
  return raw
    .map((m, idx): UIMessage | null => {
      if (!m || typeof m !== "object") return null;
      const message = m as Record<string, unknown>;
      const role = message.role;
      if (role !== "user" && role !== "assistant" && role !== "system") return null;

      // If parts already exist and are an array, trust them.
      if (Array.isArray(message.parts)) {
        return {
          id: typeof message.id === "string" ? message.id : `m-${idx}`,
          role,
          parts: message.parts,
        } as UIMessage;
      }

      // Otherwise build text part(s) from content.
      const content = typeof message.content === "string" ? message.content : "";
      return {
        id: typeof message.id === "string" ? message.id : `m-${idx}`,
        role,
        parts: content ? [{ type: "text", text: content }] : [],
      } as UIMessage;
    })
    .filter((m): m is UIMessage => m !== null);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      world: true,
      characters: { orderBy: { order: "asc" } },
      chapters: { orderBy: { number: "asc" } },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const step = parsed.data.step as Step;
  const currentChapterId = parsed.data.currentChapterId;

  const world = project.world;
  const baseCtx = {
    initialIdea: project.initialIdea,
    era: world?.era ?? "",
    geography: world?.geography ?? "",
    socialStructure: world?.socialStructure ?? "",
    powerSystem: world?.powerSystem ?? "",
    characters: project.characters.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      identity: c.identity,
      motivation: c.motivation,
    })),
  };

  // For CHAPTERS step we need the full chapter outlines + the selected chapter's content.
  let system: string;
  if (step === "CHAPTERS") {
    if (!currentChapterId) {
      return NextResponse.json(
        { error: "currentChapterId is required for CHAPTERS step" },
        { status: 400 },
      );
    }
    const current = project.chapters.find((c) => c.id === currentChapterId);
    if (!current) {
      return NextResponse.json(
        { error: "currentChapterId not found in this project" },
        { status: 400 },
      );
    }
    system = buildSystemPrompt(step, {
      ...baseCtx,
      chapters: project.chapters.map((c) => ({
        number: c.number,
        title: c.title,
        summary: c.summary,
      })),
      currentChapter: {
        id: current.id,
        number: current.number,
        title: current.title,
        summary: current.summary,
        content: current.content,
      },
    });
  } else {
    system = buildSystemPrompt(step, {
      ...baseCtx,
      chapters: project.chapters.map((c) => ({
        number: c.number,
        title: c.title,
      })),
    });
  }

  const uiMessages = toUIMessages(parsed.data.messages);
  // convertToModelMessages expects `Omit<UIMessage, 'id'>`; parts-based.
  const modelMessages = await convertToModelMessages(
    uiMessages.map(({ role, parts }) => ({ role, parts })),
  );

  // Build a tool object only containing the tools relevant for this step.
  const activeToolNames: ToolName[] = STEP_TOOLS[step];
  const tools: ToolSet = {};
  for (const name of activeToolNames) {
    const def = toolDefinitions[name];
    tools[name] = {
      description: def.description,
      inputSchema: def.parameters,
      execute: async (params: unknown) => executeTool(name, params, { projectId: id }),
    };
  }

  const result = streamText({
    model: aiModel,
    system,
    messages: modelMessages,
    temperature: 0.8,
    stopWhen: isStepCount(5),
    tools,
    onError({ error }) {
      console.error("[chat] streamText error:", error);
    },
  });

  return result.toUIMessageStreamResponse();
}
