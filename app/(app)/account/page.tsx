import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EditRecordSheet } from "@/components/edit-record-sheet";
import { PasswordForm } from "@/components/account/password-form";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { OWN_PROFILE } from "@/lib/member-fields";
import { updateMyProfileAction } from "@/app/(app)/record-actions";
import { ROLE_LABEL } from "@/lib/roles";

/**
 * The one screen every role shares. Until now a caregiver who mistyped their own
 * name at signup had no way to fix it, and nobody could change their password
 * without going through the forgotten-password email.
 *
 * No middleware change was needed: the shell guard only fences paths under
 * APP_PREFIXES, so /account is reachable by any signed-in user the same way
 * /notifications and /reports/[id] already are.
 */
export default async function AccountPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("profiles")
    .select("full_name, email, phone, whatsapp")
    .eq("id", profile.user.id)
    .maybeSingle();

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Your account"
        description={`Signed in as ${ROLE_LABEL[profile.role]}.`}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Your details</CardTitle>
          <EditRecordSheet
            group={OWN_PROFILE}
            role={profile.role}
            values={row ?? {}}
            title="Edit your details"
            successText="Your details were updated"
            onSave={updateMyProfileAction}
          />
        </CardHeader>
        <CardContent className="grid gap-2">
          {OWN_PROFILE.fields.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="truncate font-medium">
                {(row as Record<string, string | null> | null)?.[f.key] ?? "—"}
              </span>
            </div>
          ))}
          {/* Read-only here: the address is the sign-in credential, not a profile
              field, so changing it needs a confirmation round-trip of its own. */}
          <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
            <span className="text-muted-foreground">Email</span>
            <span className="truncate font-medium">{row?.email ?? "—"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm email={row?.email ?? ""} />
        </CardContent>
      </Card>
    </section>
  );
}
