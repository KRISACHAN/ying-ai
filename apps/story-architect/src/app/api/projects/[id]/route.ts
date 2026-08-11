import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: project.id,
    title: project.title,
    initialIdea: project.initialIdea,
    currentStep: project.currentStep,
    world: project.world
      ? {
          era: project.world.era,
          geography: project.world.geography,
          socialStructure: project.world.socialStructure,
          powerSystem: project.world.powerSystem,
        }
      : null,
    characters: project.characters.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      identity: c.identity,
      motivation: c.motivation,
      personality: c.personality,
      appearance: c.appearance,
      arc: c.arc,
      relationships: c.relationships,
      order: c.order,
    })),
    chapters: project.chapters.map((ch) => ({
      id: ch.id,
      number: ch.number,
      title: ch.title,
      summary: ch.summary,
      content: ch.content,
    })),
  });
}
