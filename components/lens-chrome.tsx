"use client";

import { usePathname } from "next/navigation";
import { Eye } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { setLens } from "@/app/(app)/lens-actions";
import { ROLE_ACCENT_BAR, ROLE_CHIP, ROLE_LABEL, type UserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * The shell's role context line, plus the "viewing as" banner when an admin is
 * standing at a borrowed desk.
 *
 * Both are path-aware, which is the whole reason this is a client component: a
 * lens cookie outlives the section it applies to, so an admin who sets a doctor
 * desk and then walks back to /admin/members must NOT keep seeing a red-only
 * banner on a page where they can write. The lens only means something inside
 * /clinician, so that is the only place it colours anything.
 */
export function LensChrome({
  role,
  lensRole,
  lensName,
}: {
  role: UserRole;
  /** The borrowed desk's role, or null when no lens is set. */
  lensRole: UserRole | null;
  lensName: string | null;
}) {
  const pathname = usePathname();
  const active = lensRole !== null && pathname.startsWith("/clinician");
  const hue = active ? lensRole : role;

  return (
    <>
      {/* Role context line — each shell carries its hue (DESIGN-SYSTEM §1).
          At a borrowed desk it carries that desk's hue, not the admin's. */}
      <div className={cn("h-0.5 w-full transition-colors", ROLE_ACCENT_BAR[hue])} aria-hidden />
      {active ? (
        <div className="border-b bg-muted/60 px-4 py-1.5 sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                Viewing as <span className="font-semibold text-foreground">{lensName}</span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold",
                  ROLE_CHIP[lensRole],
                )}
              >
                {ROLE_LABEL[lensRole]}
              </span>
              <span className="hidden shrink-0 sm:inline">· read-only</span>
            </p>
            <form action={setLens}>
              <input type="hidden" name="lens" value="" />
              <input type="hidden" name="to" value="/admin" />
              <SubmitButton
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                pendingText="Leaving…"
              >
                Back to admin
              </SubmitButton>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
