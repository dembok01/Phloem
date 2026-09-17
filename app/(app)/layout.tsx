import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ElderlyMode } from "@/components/elderly-mode";
import { NotificationBell } from "@/components/notification-bell";
import { AccountMenu } from "@/components/account-menu";
import { ToastProvider } from "@/components/ui/toast";
import { Tooltip } from "@base-ui/react/tooltip";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLens, viewRoleFor } from "@/lib/lens";
import { CareTeamSwitcher, lensLabel } from "@/components/care-team-switcher";
import { LensChrome } from "@/components/lens-chrome";
import { type UserRole } from "@/lib/roles";

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

  // profiles.email is where notification mail goes (lib/notify.ts), not a display
  // copy. An address change can complete with no session to sync from (a link
  // opened on another device), so heal it here, on the person's next page view
  // anywhere. A string compare on every request; the RPC runs only on a mismatch.
  const authEmail = profile.user.email?.toLowerCase();
  if (authEmail && profile.profileEmail && authEmail !== profile.profileEmail.toLowerCase()) {
    const supabase = await createClient();
    await supabase.rpc("sync_my_email");
  }

  const role = profile.role;
  // An admin may stand at another desk (lib/lens.ts). The lens tints the shell
  // and names itself in a banner, so "which desk am I at" is never a guess.
  const lens = await getLens();
  const viewRole = viewRoleFor(role, lens);
  const lensName = lens ? await lensLabel() : null;

  return (
    <ToastProvider>
      {/* One shared open-delay for every <Explain>, and grouping: once one
          explanation is showing, the next opens without re-waiting. */}
      <Tooltip.Provider delay={250}>
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
              <AccountMenu name={profile.full_name} role={role} />
            </div>
          </div>
          <LensChrome
            role={role}
            lensRole={lens ? viewRole : null}
            lensName={lensName}
          />
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
      </Tooltip.Provider>
    </ToastProvider>
  );
}
