import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      initialIdea: true,
      currentStep: true,
      updatedAt: true,
    },
  });
  return NextResponse.json(projects);
}

const createSchema = z.object({
  initialIdea: z.string().min(1, "initialIdea is required"),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { initialIdea } = parsed.data;

  const project = await prisma.project.create({
    data: {
      initialIdea,
      world: {
        create: {
          era: "",
          geography: "",
          socialStructure: "",
          powerSystem: "",
        },
      },
    },
    select: { id: true },
  });

  return NextResponse.json(project, { status: 201 });
}
