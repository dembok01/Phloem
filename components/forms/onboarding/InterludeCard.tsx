"use client";

// A calm breath between chapters: names what the caregiver just finished and what
// comes next, so a long questionnaire feels like a short series of small chapters.
// The wizard's footer supplies the "Continue" button.
import { Check } from "lucide-react";

export function InterludeCard({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="flex flex-col items-start gap-3 text-left">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-success-tint text-success">
        <Check className="size-6" aria-hidden />
      </span>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="text-muted-foreground">{lead}</p>
    </div>
  );
}
