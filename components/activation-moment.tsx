"use client";

// The one orchestrated moment on the coordinator surface (C3): shown once when
// Start Program succeeds (?ok=activated). Restrained — the growth rings draw
// in, one sentence, one button. Reduced-motion/elderly CSS renders it static.
import * as React from "react";
import { GrowthRings } from "@/components/growth-rings";
import { Button } from "@/components/ui/button";
import { formatDateIST } from "@/lib/datetime";

export function ActivationMoment({
  memberName,
  cycles,
  startDate,
}: {
  memberName: string;
  cycles: number;
  startDate: string | null;
}) {
  const [open, setOpen] = React.useState(true);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    closeRef.current?.focus();
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Program activated"
      onClick={() => setOpen(false)}
    >
      <div
        className="flex w-full max-w-sm animate-in fade-in zoom-in-95 flex-col items-center gap-4 rounded-2xl border bg-popover p-8 text-center shadow-pop duration-200 ease-out"
        onClick={(e) => e.stopPropagation()}
      >
        <GrowthRings
          cycles={Array.from({ length: cycles }, (_, i) => ({
            number: i + 1,
            status: i === 0 ? "active" : "upcoming",
          }))}
          dayOfActive={2}
          size={88}
        />
        <div className="space-y-1">
          <p className="font-display text-xl font-semibold">The program is live</p>
          <p className="text-sm text-muted-foreground">
            {memberName}&apos;s first cycle starts{" "}
            {startDate ? <strong className="text-foreground">{formatDateIST(startDate)}</strong> : "tomorrow"} — the
            care team and family have been notified.
          </p>
        </div>
        <Button ref={closeRef} onClick={() => setOpen(false)} className="min-w-32">
          Continue
        </Button>
      </div>
    </div>
  );
}
