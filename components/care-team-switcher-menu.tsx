"use client";

import * as React from "react";
import { ChevronDown, Check, Eye } from "lucide-react";
import { setLens } from "@/app/(app)/lens-actions";
import { ROLE_CHIP, ROLE_LABEL, type UserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

export type DeskOption = {
  /** Cookie value: "" clears the lens. */
  lens: string;
  to: "/admin" | "/coordinator" | "/clinician/clients";
  label: string;
  /** Role whose hue/label this desk carries. */
  role: UserRole;
  group: string;
};

/**
 * "Whose desk am I at?" — admin only.
 *
 * Each row is its own form so the whole thing works with JavaScript off; the
 * popover is the only part that needs the client.
 */
export function CareTeamSwitcherMenu({
  options,
  current,
}: {
  options: DeskOption[];
  current: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = options.find((o) => o.lens === current);
  const groups = options.reduce<Record<string, DeskOption[]>>((acc, o) => {
    (acc[o.group] ??= []).push(o);
    return acc;
  }, {});

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex max-w-[13rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {current ? <Eye className="size-3.5 shrink-0" aria-hidden /> : null}
        <span className="truncate">{active ? active.label : "Admin desk"}</span>
        <ChevronDown className="size-3.5 shrink-0" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-xl border bg-card p-1 shadow-pop"
        >
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <p className="px-3 pt-2 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
                {group}
              </p>
              {items.map((o) => (
                <form key={`${o.group}:${o.lens}`} action={setLens}>
                  <input type="hidden" name="lens" value={o.lens} />
                  <input type="hidden" name="to" value={o.to} />
                  <button
                    type="submit"
                    role="menuitem"
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                      o.lens === current && "bg-muted",
                    )}
                  >
                    <span className="truncate">{o.label}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[0.7rem] font-semibold",
                          ROLE_CHIP[o.role],
                        )}
                      >
                        {ROLE_LABEL[o.role]}
                      </span>
                      {o.lens === current ? <Check className="size-3.5" aria-hidden /> : null}
                    </span>
                  </button>
                </form>
              ))}
            </div>
          ))}
          <p className="px-3 pt-2 pb-2 text-[0.7rem] leading-snug text-muted-foreground">
            Care-team desks are read-only. Consult forms and monthly feedback stay with the
            clinician who owns them.
          </p>
        </div>
      ) : null}
    </div>
  );
}
