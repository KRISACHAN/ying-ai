import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  title: z.string().min(1, "title required"),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const trimmed = parsed.data.title.trim();
  if (trimmed.length === 0 || trimmed.length > 30) {
    return NextResponse.json({ error: "title length must be 1-30 chars" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const updated = await prisma.project.update({
    where: { id },
    data: { title: trimmed },
  });
  return NextResponse.json({ success: true, title: updated.title });
}
