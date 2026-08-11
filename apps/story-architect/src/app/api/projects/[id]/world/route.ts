import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  era: z.string().optional(),
  geography: z.string().optional(),
  socialStructure: z.string().optional(),
  powerSystem: z.string().optional(),
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
  const data = parsed.data;

  const updated = await prisma.worldBuilding.upsert({
    where: { projectId: id },
    update: data,
    create: {
      projectId: id,
      era: data.era ?? "",
      geography: data.geography ?? "",
      socialStructure: data.socialStructure ?? "",
      powerSystem: data.powerSystem ?? "",
    },
  });
  return NextResponse.json({
    success: true,
    world: {
      era: updated.era,
      geography: updated.geography,
      socialStructure: updated.socialStructure,
      powerSystem: updated.powerSystem,
    },
  });
}
