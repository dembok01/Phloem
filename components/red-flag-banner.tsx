import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RedFlag } from "@/lib/red-flags";

// §11/§13 red-flag banner: Honey ground, plain language, no severity jargon.
// High-severity lines carry a Clay marker so they cannot be missed (C3).
const PLAIN: Record<string, string> = {
  chest_pain: "Reported chest pain during activity — doctor review required before training.",
  no_cardiac_eval: "No cardiac evaluation in the past 12 months — the doctor will advise tests first.",
  fall_risk: "Signs of fall risk — training uses supported, supervised work.",
  breathing_stamina: "Breathlessness or low stamina reported — activity starts gently.",
};

export function RedFlagBanner({ flags, className }: { flags: RedFlag[]; className?: string }) {
  if (flags.length === 0) return null;
  const ordered = [...flags].sort((a, b) => (a.severity === "high" ? -1 : 0) - (b.severity === "high" ? -1 : 0));
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-xl border border-warning/40 bg-warning-tint p-4 text-foreground",
        className,
      )}
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
        <ShieldAlert className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 space-y-1.5">
        <p className="font-semibold">Health flags on file</p>
        <ul className="space-y-1 text-sm">
          {ordered.map((f) => (
            <li key={f.id} className="flex items-start gap-2">
              <span
                aria-hidden
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  f.severity === "high" ? "bg-danger" : "bg-warning",
                )}
              />
              <span>
                {PLAIN[f.id] ?? f.label}
                {f.severity === "high" ? (
                  <strong className="ml-1.5 font-semibold text-danger">Needs doctor review.</strong>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
