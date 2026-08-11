import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  identity: z.string().optional(),
  motivation: z.string().optional(),
  personality: z.string().optional(),
  appearance: z.string().optional(),
  arc: z.string().optional(),
  relationships: z.string().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; charId: string }> },
) {
  const { id: projectId, charId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Ensure character belongs to project.
  const existing = await prisma.character.findFirst({
    where: { id: charId, projectId },
  });
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const updated = await prisma.character.update({
    where: { id: charId },
    data: parsed.data,
  });
  return NextResponse.json({ success: true, character: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; charId: string }> },
) {
  const { id: projectId, charId } = await params;

  const existing = await prisma.character.findFirst({
    where: { id: charId, projectId },
    select: { id: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await prisma.character.delete({ where: { id: charId } });
  return NextResponse.json({ success: true, id: charId, name: existing.name });
}
