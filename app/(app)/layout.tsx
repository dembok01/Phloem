import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/ui/submit-button";
import { ElderlyMode } from "@/components/elderly-mode";
import { NotificationBell } from "@/components/notification-bell";
import { ToastProvider } from "@/components/ui/toast";
import { getSessionProfile } from "@/lib/auth";
import { getLens, viewRoleFor } from "@/lib/lens";
import { CareTeamSwitcher, lensLabel } from "@/components/care-team-switcher";
import { setLens } from "@/app/(app)/lens-actions";
import { logout } from "@/app/(auth)/login/actions";
import { ROLE_ACCENT_BAR, ROLE_CHIP, ROLE_LABEL, type UserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

const ROLE_HOME: Record<UserRole, string> = {
  admin: "/admin",
  coordinator: "/coordinator",
  doctor: "/clinician/clients",
  nutritionist: "/clinician/clients",
  trainer: "/clinician/clients",
  psychologist: "/clinician/clients",
  caregiver: "/portal",
  member: "/portal",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (profile.status === "suspended") redirect("/login?notice=suspended");

  const role = profile.role;
  // An admin may stand at another desk (lib/lens.ts). The lens tints the shell
  // and names itself in a banner, so "which desk am I at" is never a guess.
  const lens = await getLens();
  const viewRole = viewRoleFor(role, lens);
  const lensName = lens ? await lensLabel() : null;

  return (
    <ToastProvider>
      {profile.elderly ? <ElderlyMode /> : null}
      <div className="flex min-h-screen flex-col bg-background">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow-pop"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur print:hidden">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link
              href={ROLE_HOME[role]}
              className="flex shrink-0 items-center rounded-md"
              aria-label="PHLOEM home"
            >
              <Image
                src="/phloem-logo.png"
                alt="PHLOEM"
                width={120}
                height={40}
                className="h-8 w-auto"
                priority
              />
            </Link>
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
              <CareTeamSwitcher />
              <NotificationBell />
              <span className="hidden min-w-0 items-center gap-2 sm:flex">
                <span className="truncate font-medium">{profile.full_name}</span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
                    ROLE_CHIP[role],
                  )}
                >
                  {ROLE_LABEL[role]}
                </span>
              </span>
              <form action={logout}>
                <SubmitButton
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  pendingText="Signing out…"
                >
                  Sign out
                </SubmitButton>
              </form>
            </div>
          </div>
          {/* Role context line — each shell carries its hue (DESIGN-SYSTEM §1).
              Under a lens it carries the BORROWED desk's hue, not the admin's. */}
          <div className={cn("h-0.5 w-full", ROLE_ACCENT_BAR[viewRole])} aria-hidden />
          {lens ? (
            <div className="border-b bg-muted/60 px-4 py-1.5 sm:px-6">
              <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
                <p className="min-w-0 truncate text-xs text-muted-foreground">
                  Viewing as{" "}
                  <span className="font-semibold text-foreground">{lensName}</span>{" "}
                  <span className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-semibold", ROLE_CHIP[viewRole])}>
                    {ROLE_LABEL[viewRole]}
                  </span>{" "}
                  · read-only
                </p>
                <form action={setLens}>
                  <input type="hidden" name="lens" value="" />
                  <input type="hidden" name="to" value="/admin" />
                  <SubmitButton variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" pendingText="Leaving…">
                    Back to admin
                  </SubmitButton>
                </form>
              </div>
            </div>
          ) : null}
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
