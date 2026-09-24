"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { usePathname } from "next/navigation";
import { ChevronDown, Check, Eye, Loader2 } from "lucide-react";
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
  const pathname = usePathname();

  // The menu lives in the shell layout, which survives the switch — so it closes
  // when the new desk arrives (a new path, or the same path under a new lens),
  // not on click, where it would take the row's spinner away with it.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname, current]);

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

  // Admin and Coordinator desks share lens "" — the page says which one this is.
  // A lens only applies inside /clinician (see LensChrome).
  const onLensDesk = current !== "" && pathname.startsWith("/clinician");
  const isActive = (o: DeskOption) =>
    onLensDesk ? o.lens === current : o.lens === "" && pathname.startsWith(o.to);
  const active = options.find(isActive);
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
        {onLensDesk ? <Eye className="size-3.5 shrink-0" aria-hidden /> : null}
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
                <form key={`${o.lens}:${o.to}`} action={setLens}>
                  <input type="hidden" name="lens" value={o.lens} />
                  <input type="hidden" name="to" value={o.to} />
                  <DeskButton option={o} active={isActive(o)} />
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

/** One desk. Its own component so useFormStatus can see the row's form: a switch
 * is a server action plus a whole new desk to render, seconds on a slow link,
 * and the row has to say it heard the click. */
function DeskButton({ option, active }: { option: DeskOption; active: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="menuitem"
      disabled={pending}
      aria-busy={pending}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
        (active || pending) && "bg-muted",
      )}
    >
      <span className="truncate">{pending ? `Opening ${option.label}…` : option.label}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[0.7rem] font-semibold",
            ROLE_CHIP[option.role],
          )}
        >
          {ROLE_LABEL[option.role]}
        </span>
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : active ? (
          <Check className="size-3.5" aria-hidden />
        ) : null}
      </span>
    </button>
  );
}
