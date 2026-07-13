import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { formatDateIST } from "@/lib/datetime";

async function analytics() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const weekEndIso = new Date(Date.now() + 7 * 86400_000).toISOString();
  const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const d30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const d60 = new Date(Date.now() - 60 * 86400_000).toISOString();

  const [active, consultsWeek, overdue, renewals, renewalList, m30, m60, r30, r60, c30, c60] =
    await Promise.all([
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
      // 30-day deltas (C6): last 30 days vs the 30 before that.
      supabase.from("members").select("id", { count: "exact", head: true }).gte("created_at", d30),
      supabase.from("members").select("id", { count: "exact", head: true }).gte("created_at", d60).lt("created_at", d30),
      supabase.from("reports").select("id", { count: "exact", head: true }).gte("created_at", d30),
      supabase.from("reports").select("id", { count: "exact", head: true }).gte("created_at", d60).lt("created_at", d30),
      supabase
        .from("consultations")
        .select("id", { count: "exact", head: true })
        .eq("meeting_status", "done")
        .gte("completed_at", d30),
      supabase
        .from("consultations")
        .select("id", { count: "exact", head: true })
        .eq("meeting_status", "done")
        .gte("completed_at", d60)
        .lt("completed_at", d30),
    ]);

  return {
    active: active.count ?? 0,
    consultsWeek: consultsWeek.count ?? 0,
    overdue: overdue.count ?? 0,
    renewals: renewals.count ?? 0,
    renewalList: renewalList.data ?? [],
    thirtyDay: [
      { label: "New members", now: m30.count ?? 0, prev: m60.count ?? 0 },
      { label: "Consultations held", now: c30.count ?? 0, prev: c60.count ?? 0 },
      { label: "Reports written", now: r30.count ?? 0, prev: r60.count ?? 0 },
    ],
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
      <PageHeader title="Overview" description="Program health at a glance." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardHeader>
              <CardTitle className="text-muted-foreground">{t.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="font-display text-3xl font-semibold">{t.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* C6: 30-day movement, each vs the previous 30 days. */}
      <div className="grid gap-4 sm:grid-cols-3">
        {a.thirtyDay.map((d) => {
          const diff = d.now - d.prev;
          return (
            <Card key={d.label} size="sm">
              <CardContent className="space-y-0.5">
                <p className="text-sm text-muted-foreground">{d.label} · 30 days</p>
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-2xl font-semibold">{d.now}</span>
                  <span className="font-data text-xs text-muted-foreground">
                    {diff === 0 ? "— level with" : diff > 0 ? `▲ ${diff} vs` : `▼ ${Math.abs(diff)} vs`} prior 30d
                  </span>
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Renewal radar</CardTitle>
        </CardHeader>
        <CardContent>
          {a.renewalList.length === 0 ? (
            <p className="text-muted-foreground">
              Nothing coming up — members whose package ends within 30 days will surface here.
            </p>
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

    </section>
  );
}
