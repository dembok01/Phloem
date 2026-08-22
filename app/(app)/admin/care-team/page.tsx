import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { CareTeamTable, type CareTeamRow } from "@/components/admin/care-team-table";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/roles";
import { inviteProfessional } from "./actions";

const CARE_ROLES = ["doctor", "nutritionist", "trainer", "psychologist"] as const;

const ERRORS: Record<string, string> = {
  invalid: "Please check the form and try again.",
  invite_failed: "Could not create the invite. Please try again.",
  status_failed: "Could not update the account status. Please try again.",
};

export default async function CareTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; role?: string }>;
}) {
  const { error, role } = await searchParams;
  const supabase = await createClient();

  const { data: team } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, specialization, role, status")
    .in("role", [...CARE_ROLES])
    .order("role")
    .order("full_name");

  const rows: CareTeamRow[] = (team ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    phone: p.phone,
    specialization: p.specialization,
    role: p.role as CareTeamRow["role"],
    suspended: p.status === "suspended",
  }));

  const initialRole = role && (CARE_ROLES as readonly string[]).includes(role) ? role : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="min-w-0 space-y-6">
        <PageHeader
          title="Care team"
          description="Doctors, nutritionists, trainers and psychologists. Suspending an account is an instant lockout everywhere."
        />

        {error && ERRORS[error] ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive"
          >
            {ERRORS[error]}
          </p>
        ) : null}

        <CareTeamTable rows={rows} initialRole={initialRole} />
      </section>

      <aside>
        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>Invite a professional</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={inviteProfessional} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  name="role"
                  required
                  defaultValue=""
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="" disabled>
                    Select a role…
                  </option>
                  {CARE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
              <SubmitButton className="pressable w-full" pendingText="Sending…">
                Send invite
              </SubmitButton>
              <p className="text-xs text-muted-foreground">
                The account&apos;s role is fixed by this invite and can only be claimed via the
                emailed link.
              </p>
            </form>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
