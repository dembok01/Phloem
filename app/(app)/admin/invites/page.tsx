import { PageHeader } from "@/components/page-header";
import { InvitesTable, type InviteRow } from "@/components/admin/invites-table";
import { createClient } from "@/lib/supabase/server";
import { inviteState, inviteUrl } from "@/lib/invite";
import { ROLE_LABEL } from "@/lib/roles";

const NOTICES: Record<string, string> = {
  created: "Invite created. Copy the link below and send it to the invitee.",
  revoked: "Invite revoked.",
};

const ERRORS: Record<string, string> = {
  invalid: "Invalid request.",
  revoke_failed: "Could not revoke that invite. It may already be used.",
};

export default async function InvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; revoked?: string; error?: string; state?: string }>;
}) {
  const { created, revoked, error, state } = await searchParams;
  const supabase = await createClient();

  const { data: invites } = await supabase
    .from("invites")
    .select("id, email, role, member_id, token, expires_at, used_at, created_at")
    .order("created_at", { ascending: false });

  // The accept URL is built here because it needs NEXT_PUBLIC_APP_URL, and the
  // token is withheld entirely once the invite is used or expired.
  const rows: InviteRow[] = (invites ?? []).map((inv) => {
    const s = inviteState(inv);
    return {
      id: inv.id,
      email: inv.email,
      roleLabel: ROLE_LABEL[inv.role],
      kind: inv.member_id ? "Member caregiver" : "Care team",
      state: s,
      expires_at: inv.expires_at,
      url: s === "pending" ? inviteUrl(inv.token) : null,
    };
  });

  const notice = created ? NOTICES.created : revoked ? NOTICES.revoked : null;
  const initialState =
    state && ["pending", "used", "expired"].includes(state) ? state : null;

  return (
    <section className="space-y-6">
      <PageHeader
        title="Invites"
        description="Pending, used and expired invitations. In development the accept link is shown here to copy — no email is sent."
      />

      {notice ? (
        <p role="status" className="rounded-md border border-success/30 bg-success-tint p-3 text-foreground">
          {notice}
        </p>
      ) : null}
      {error && ERRORS[error] ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
          {ERRORS[error]}
        </p>
      ) : null}

      <InvitesTable rows={rows} initialState={initialState} />
    </section>
  );
}
