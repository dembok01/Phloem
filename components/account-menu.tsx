"use client";

// The header used to show a name, a role chip and a Sign out button, none of
// which went anywhere. /account had no route into it, so this turns the name
// into the menu that reaches it. Outside-click and Escape handling mirrors
// components/care-team-switcher-menu.tsx rather than introducing a second
// popover pattern.
import * as React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { logout } from "@/app/(auth)/login/actions";
import { ROLE_CHIP, ROLE_LABEL, type UserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function AccountMenu({ name, role }: { name: string; role: UserRole }) {
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? "account-menu" : undefined}
        className="pressable flex min-w-0 items-center gap-2 rounded-md px-2 py-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="hidden max-w-[10rem] truncate font-medium sm:inline">{name}</span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
            ROLE_CHIP[role],
          )}
        >
          {ROLE_LABEL[role]}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open ? (
        <div
          id="account-menu"
          className="absolute right-0 z-50 mt-1 w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-pop"
        >
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
          >
            Your account
          </Link>
          <form action={logout}>
            <SubmitButton
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              pendingText="Signing out…"
            >
              Sign out
            </SubmitButton>
          </form>
        </div>
      ) : null}
    </div>
  );
}
