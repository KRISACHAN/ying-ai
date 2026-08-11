import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProjectHeader } from "@/components/ProjectHeader";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!project) notFound();

  return (
    <div className="flex h-screen flex-col">
      <ProjectHeader projectId={project.id} title={project.title} />
      <main className="flex min-h-0 flex-1">{children}</main>
    </div>
  );
}
