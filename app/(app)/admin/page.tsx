import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { formatDateIST } from "@/lib/datetime";

async function analytics() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const weekEndIso = new Date(Date.now() + 7 * 86400_000).toISOString();
  const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const [active, consultsWeek, overdue, renewals, renewalList] = await Promise.all([
    supabase.from("members").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("consultations")
      .select("id", { count: "exact", head: true })
      .gte("scheduled_at", nowIso)
      .lte("scheduled_at", weekEndIso)
      .eq("meeting_status", "scheduled"),
    supabase
      .from("consultations")
      .select("id", { count: "exact", head: true })
      .eq("meeting_status", "done")
      .eq("report_status", "pending"),
    supabase
      .from("packages")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gte("end_date", today)
      .lte("end_date", in30),
    supabase
      .from("packages")
      .select("id, end_date, members!inner(id, full_name, status)")
      .eq("status", "active")
      .gte("end_date", today)
      .lte("end_date", in30)
      .order("end_date", { ascending: true })
      .limit(8),
  ]);

  return {
    active: active.count ?? 0,
    consultsWeek: consultsWeek.count ?? 0,
    overdue: overdue.count ?? 0,
    renewals: renewals.count ?? 0,
    renewalList: renewalList.data ?? [],
  };
}

export default async function AdminOverviewPage() {
  const a = await analytics();
  const tiles = [
    { label: "Active members", value: a.active },
    { label: "Consults this week", value: a.consultsWeek },
    { label: "Overdue reports", value: a.overdue },
    { label: "Renewals (30 days)", value: a.renewals },
  ];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin overview</h1>
        <p className="text-muted-foreground">Program health at a glance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardHeader>
              <CardTitle className="text-muted-foreground">{t.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-3xl font-semibold">{t.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Renewal radar</CardTitle>
        </CardHeader>
        <CardContent>
          {a.renewalList.length === 0 ? (
            <p className="text-muted-foreground">No packages renewing in the next 30 days.</p>
          ) : (
            <ul className="divide-y">
              {a.renewalList.map((p) => {
                const m = p.members as { id: string; full_name: string; status: string };
                return (
                  <li key={p.id} className="flex items-center justify-between py-2.5">
                    <Link href={`/admin/members/${m.id}`} className="font-medium hover:underline">
                      {m.full_name}
                    </Link>
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      {m.status === "renewal_due" ? <Badge variant="warning">Renewal due</Badge> : null}
                      Ends {formatDateIST(p.end_date)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/members" className="rounded-lg border px-4 py-2 font-medium hover:bg-muted">Members</Link>
        <Link href="/admin/care-team" className="rounded-lg border px-4 py-2 font-medium hover:bg-muted">Care team</Link>
        <Link href="/admin/invites" className="rounded-lg border px-4 py-2 font-medium hover:bg-muted">Invites</Link>
        <Link href="/admin/audit" className="rounded-lg border px-4 py-2 font-medium hover:bg-muted">Audit log</Link>
      </div>
    </section>
  );
}
