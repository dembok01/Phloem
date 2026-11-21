import { redirect } from "next/navigation";
import { ElderlyMode } from "@/components/elderly-mode";
import { NotificationBell } from "@/components/notification-bell";
import { AccountMenu } from "@/components/account-menu";
import { ToastProvider } from "@/components/ui/toast";
import { Tooltip } from "@base-ui/react/tooltip";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/observe";
import { getLens, viewRoleFor } from "@/lib/lens";
import { CareTeamSwitcher, lensLabel } from "@/components/care-team-switcher";
import { LensChrome } from "@/components/lens-chrome";
import { WorkspaceShell } from "@/components/workspace-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (profile.status === "suspended") redirect("/login?notice=suspended");

  // profiles.email is where notification mail goes (lib/notify.ts), not a display
  // copy. An address change can complete with no session to sync from (a link
  // opened on another device), so heal it here, on the person's next full page
  // load or sign-in (a shared layout does not re-run on client-side navigation).
  // A string compare on every request; the RPC runs only on a mismatch.
  const authEmail = profile.user.email?.toLowerCase();
  if (authEmail && profile.profileEmail && authEmail !== profile.profileEmail.toLowerCase()) {
    const supabase = await createClient();
    const { error } = await supabase.rpc("sync_my_email");
    if (error) logEvent("auth.email_sync.failed", { reason: error.message });
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
      <WorkspaceShell
        role={role}
        viewRole={viewRole}
        switcher={<CareTeamSwitcher />}
        notifications={<NotificationBell />}
        account={<AccountMenu name={profile.full_name} role={role} />}
        lensBanner={<LensChrome role={role} lensRole={lens ? viewRole : null} lensName={lensName} />}
      >
        {children}
      </WorkspaceShell>
      </Tooltip.Provider>
    </ToastProvider>
  );
}
