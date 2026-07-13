import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { hasHighFlag as hasHigh, parseRedFlags } from "@/lib/red-flags";

function hasHighFlag(red_flags: Json): boolean {
  return hasHigh(parseRedFlags(red_flags));
}

const STATUS_LABEL: Record<string, string> = {
  invited: "Invited",
  signed_up: "Signed up",
  onboarding: "Onboarding",
  onboarded: "Onboarded",
  assigned: "Assigned",
  initial_consults: "Initial consults",
  ready_to_start: "Ready to start",
  active: "Active",
  renewal_due: "Renewal due",
  inactive: "Inactive",
};

export default async function MembersPage() {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("members")
    .select("id, full_name, age, city, status, red_flags, caregiver_id")
    .order("created_at", { ascending: false });

  return (
    <section className="space-y-6">
      <PageHeader
        title="Members"
        description="Enrolled members and their onboarding status."
        actions={
          <Link href="/admin/members/new" className={cn(buttonVariants())}>
            Enroll member
          </Link>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Age</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 font-medium">Caregiver</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(members ?? []).map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/members/${m.id}`}
                        className="flex items-center gap-2 font-medium text-foreground hover:underline"
                      >
                        {hasHighFlag(m.red_flags) ? (
                          <span
                            className="inline-block size-2 rounded-full bg-destructive"
                            title="High red flag"
                            aria-label="High red flag"
                          />
                        ) : null}
                        {m.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{m.age ?? "—"}</td>
                    <td className="px-4 py-3">{m.city ?? "—"}</td>
                    <td className="px-4 py-3">
                      {m.caregiver_id ? (
                        <Badge variant="success">Linked</Badge>
                      ) : (
                        <Badge variant="warning">Pending</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="muted">{STATUS_LABEL[m.status] ?? m.status}</Badge>
                    </td>
                  </tr>
                ))}
                {(members ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      No members yet. Enroll one to send a caregiver invite.
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
