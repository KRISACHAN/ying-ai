import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const resetSchema = z.object({
  step: z.enum(["WORLDBUILDING", "CHARACTERS", "OUTLINE"]),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const step = parsed.data.step;

  try {
    await prisma.$transaction(async (tx) => {
      if (step === "WORLDBUILDING") {
        await tx.worldBuilding.upsert({
          where: { projectId: id },
          update: { era: "", geography: "", socialStructure: "", powerSystem: "" },
          create: {
            projectId: id,
            era: "",
            geography: "",
            socialStructure: "",
            powerSystem: "",
          },
        });
        await tx.character.deleteMany({ where: { projectId: id } });
        await tx.chapter.deleteMany({ where: { projectId: id } });
        await tx.project.update({
          where: { id },
          data: { currentStep: "WORLDBUILDING" },
        });
      } else if (step === "CHARACTERS") {
        await tx.character.deleteMany({ where: { projectId: id } });
        await tx.chapter.deleteMany({ where: { projectId: id } });
        await tx.project.update({
          where: { id },
          data: { currentStep: "CHARACTERS" },
        });
      } else {
        // OUTLINE
        await tx.chapter.deleteMany({ where: { projectId: id } });
        await tx.project.update({
          where: { id },
          data: { currentStep: "OUTLINE" },
        });
      }
    });
  } catch (err) {
    console.error("[reset-from] failed:", err);
    return NextResponse.json({ error: "reset failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
