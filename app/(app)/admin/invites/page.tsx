import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { CopyField } from "@/components/copy-field";
import { createClient } from "@/lib/supabase/server";
import { inviteState, inviteUrl } from "@/lib/invite";
import type { Database } from "@/lib/supabase/database.types";
import { revokeInvite } from "./actions";

type UserRole = Database["public"]["Enums"]["user_role"];

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrator",
  coordinator: "Care Coordinator",
  doctor: "Doctor",
  nutritionist: "Nutritionist",
  trainer: "Trainer",
  psychologist: "Psychologist",
  caregiver: "Caregiver",
  member: "Member",
};

const NOTICES: Record<string, string> = {
  created: "Invite created. Copy the link below and send it to the invitee.",
  revoked: "Invite revoked.",
};

const ERRORS: Record<string, string> = {
  invalid: "Invalid request.",
  revoke_failed: "Could not revoke that invite. It may already be used.",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

export default async function InvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; revoked?: string; error?: string }>;
}) {
  const { created, revoked, error } = await searchParams;
  const supabase = await createClient();

  const { data: invites } = await supabase
    .from("invites")
    .select("id, email, role, member_id, token, expires_at, used_at, created_at")
    .order("created_at", { ascending: false });

  const notice = created ? NOTICES.created : revoked ? NOTICES.revoked : null;

  return (
    <section className="space-y-6">
      <PageHeader
        title="Invites"
        description="Pending, used and expired invitations. In development the accept link is shown here to copy — no email is sent."
      />

      {notice ? (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
          {notice}
        </p>
      ) : null}
      {error && ERRORS[error] ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
          {ERRORS[error]}
        </p>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Kind</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium">Link / action</th>
                </tr>
              </thead>
              <tbody>
                {(invites ?? []).map((inv) => {
                  const state = inviteState(inv);
                  return (
                    <tr key={inv.id} className="border-b align-top last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{inv.email}</td>
                      <td className="px-4 py-3">{ROLE_LABEL[inv.role]}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {inv.member_id ? "Member caregiver" : "Care team"}
                      </td>
                      <td className="px-4 py-3">
                        {state === "used" ? (
                          <Badge variant="success">Used</Badge>
                        ) : state === "expired" ? (
                          <Badge variant="danger">Expired</Badge>
                        ) : (
                          <Badge variant="warning">Pending</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {dateFmt.format(new Date(inv.expires_at))}
                      </td>
                      <td className="px-4 py-3">
                        {state === "used" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {state === "pending" ? (
                              <CopyField value={inviteUrl(inv.token)} label={`Invite link for ${inv.email}`} />
                            ) : null}
                            <form action={revokeInvite}>
                              <input type="hidden" name="id" value={inv.id} />
                              <SubmitButton size="sm" variant="destructive" pendingText="Revoking…">
                                Revoke
                              </SubmitButton>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(invites ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No invites yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
