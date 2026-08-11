import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "WORLDBUILDING" | "CHARACTERS" | "OUTLINE" | "CHAPTERS";

const STEP_LABELS: { key: Step; label: string; segment: string }[] = [
  { key: "WORLDBUILDING", label: "世界观", segment: "worldbuilding" },
  { key: "CHARACTERS", label: "人物", segment: "characters" },
  { key: "OUTLINE", label: "大纲", segment: "outline" },
  { key: "CHAPTERS", label: "章节", segment: "chapters" },
];

interface StepProgressProps {
  currentStep: Step;
  /** Project id used to build links for clickable completed steps. */
  projectId?: string;
}

export function StepProgress({ currentStep, projectId }: StepProgressProps) {
  const currentIndex = STEP_LABELS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center gap-2">
      {STEP_LABELS.map((step, idx) => {
        const isCurrent = idx === currentIndex;
        const isDone = idx < currentIndex;
        const isFuture = idx > currentIndex;
        const clickable = isDone && projectId;

        const node = (
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
                clickable && "hover:bg-primary/10",
                isCurrent && "border-primary bg-primary text-primary-foreground",
                isDone && "border-primary text-primary",
                isFuture && "border-muted-foreground/30 text-muted-foreground/50",
              )}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : idx + 1}
            </span>
            <span
              className={cn(
                "text-sm",
                clickable && "hover:text-primary",
                isCurrent && "font-semibold text-foreground",
                isDone && "text-foreground/80",
                isFuture && "text-muted-foreground/60",
              )}
            >
              {step.label}
            </span>
          </div>
        );

        return (
          <div key={step.key} className="flex items-center gap-2">
            {clickable ? (
              <Link href={`/p/${projectId}/${step.segment}`} className="rounded transition-colors">
                {node}
              </Link>
            ) : (
              node
            )}
            {idx < STEP_LABELS.length - 1 && (
              <span className={cn("mx-1 h-px w-6", isDone ? "bg-primary" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
