import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { MembersTable, type MemberRow } from "@/components/admin/members-table";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { hasHighFlag, parseRedFlags } from "@/lib/red-flags";
import { MEMBER_STATUS_LABEL, type MemberStatus } from "@/lib/member-status";

/**
 * §10 admin member list.
 *
 * `?status=` is honoured here rather than ignored: the dashboard funnel's nine
 * stages and two of its tiles link straight into a filtered list, and until this
 * page read the param those links quietly did nothing. The value is validated
 * against the enum so a hand-typed status cannot blank the page.
 */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("members")
    .select("id, full_name, age, city, status, red_flags, caregiver_id")
    .order("created_at", { ascending: false });

  // Red flags are parsed here so the parser never ships to the client; the table
  // only ever sees a boolean.
  const rows: MemberRow[] = (members ?? []).map((m) => ({
    id: m.id,
    full_name: m.full_name,
    age: m.age,
    city: m.city,
    status: m.status,
    linked: Boolean(m.caregiver_id),
    high: hasHighFlag(parseRedFlags(m.red_flags)),
  }));

  const initialStatus =
    status && status in MEMBER_STATUS_LABEL ? (status as MemberStatus) : null;

  return (
    <section className="space-y-6">
      <PageHeader
        title="Members"
        description="Everyone enrolled, and where each of them is in the programme."
        actions={
          <Link href="/admin/members/new" className={cn(buttonVariants(), "pressable")}>
            Enroll member
          </Link>
        }
      />
      <MembersTable rows={rows} initialStatus={initialStatus} />
    </section>
  );
}
