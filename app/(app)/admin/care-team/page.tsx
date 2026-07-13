import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { inviteProfessional, setAccountStatus } from "./actions";

const CARE_ROLES = ["doctor", "nutritionist", "trainer", "psychologist"] as const;

const ROLE_LABEL: Record<(typeof CARE_ROLES)[number], string> = {
  doctor: "Doctor",
  nutritionist: "Nutritionist",
  trainer: "Trainer",
  psychologist: "Psychologist",
};

const ERRORS: Record<string, string> = {
  invalid: "Please check the form and try again.",
  invite_failed: "Could not create the invite. Please try again.",
  status_failed: "Could not update the account status. Please try again.",
};

export default async function CareTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: team } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, specialization, role, status")
    .in("role", [...CARE_ROLES])
    .order("role")
    .order("full_name");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="space-y-6">
        <PageHeader
          title="Care team"
          description="Doctors, nutritionists, trainers and psychologists. Suspending an account is an instant lockout everywhere."
        />

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
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Contact</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(team ?? []).map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{p.full_name}</div>
                        {p.specialization ? (
                          <div className="text-xs text-muted-foreground">{p.specialization}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 capitalize">{p.role}</td>
                      <td className="px-4 py-3">
                        <div>{p.email}</div>
                        {p.phone ? <div className="text-xs text-muted-foreground">{p.phone}</div> : null}
                      </td>
                      <td className="px-4 py-3">
                        {p.status === "suspended" ? (
                          <Badge variant="danger">Suspended</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <form action={setAccountStatus} className="inline">
                          <input type="hidden" name="user_id" value={p.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={p.status === "suspended" ? "active" : "suspended"}
                          />
                          <Button
                            type="submit"
                            size="sm"
                            variant={p.status === "suspended" ? "outline" : "destructive"}
                          >
                            {p.status === "suspended" ? "Reactivate" : "Suspend"}
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                  {(team ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        No care-team members yet. Invite one to get started.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <aside>
        <Card>
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
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
              <Button type="submit" className="w-full">
                Send invite
              </Button>
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
