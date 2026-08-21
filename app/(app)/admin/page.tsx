import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Sparkline } from "@/components/charts/sparkline";
import { StageFunnel, type Stage } from "@/components/charts/stage-funnel";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarHeart } from "lucide-react";
import { GrowthRings } from "@/components/growth-rings";
import { TrendLine } from "@/components/charts/trend-line";
import { createClient } from "@/lib/supabase/server";
import { formatDateIST } from "@/lib/datetime";
import { cn } from "@/lib/utils";

const WEEKS = 12;
const WEEK_MS = 7 * 86400_000;

/** Bucket ISO timestamps into the last `WEEKS` weekly counts, oldest first.
 *  Done in JS rather than SQL: volumes here are in the hundreds, and a
 *  date_trunc aggregate would need an RPC — this stays presentation-only. */
function weekly(rows: { at: string | null }[], now = Date.now()): number[] {
  const buckets = new Array<number>(WEEKS).fill(0);
  const start = now - WEEKS * WEEK_MS;
  for (const r of rows) {
    if (!r.at) continue;
    const t = new Date(r.at).getTime();
    if (t < start || t > now) continue;
    const i = Math.min(WEEKS - 1, Math.floor((t - start) / WEEK_MS));
    buckets[i] += 1;
  }
  return buckets;
}

async function analytics() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const weekEndIso = new Date(Date.now() + 7 * 86400_000).toISOString();
  const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - WEEKS * WEEK_MS).toISOString();

  const [members, consultsWeek, overdue, renewals, renewalList, newMembers, consultRows, reportRows] =
    await Promise.all([
      // One read powers both the funnel and the active count.
      supabase.from("members").select("status"),
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
      supabase.from("members").select("created_at").gte("created_at", since),
      supabase
        .from("consultations")
        .select("completed_at")
        .eq("meeting_status", "done")
        .gte("completed_at", since),
      supabase.from("reports").select("created_at").gte("created_at", since),
    ]);

  const byStatus = new Map<string, number>();
  for (const m of members.data ?? []) byStatus.set(m.status, (byStatus.get(m.status) ?? 0) + 1);

  const memberSeries = weekly((newMembers.data ?? []).map((r) => ({ at: r.created_at })));
  const consultSeries = weekly((consultRows.data ?? []).map((r) => ({ at: r.completed_at })));
  const reportSeries = weekly((reportRows.data ?? []).map((r) => ({ at: r.created_at })));

  // "In care" is everyone past intake — the number an admin means when they ask
  // how big the programme is. `active` alone under-reports it badly while
  // families are still in their initial consultations.
  const IN_CARE = ["assigned", "initial_consults", "ready_to_start", "active", "renewal_due"];
  const inCare = IN_CARE.reduce((n, k) => n + (byStatus.get(k) ?? 0), 0);

  // The signature mark, aggregated: one ring per family in care, filled for those
  // already running. It encodes the same fact as the number beside it.
  const ringCycles = Array.from({ length: Math.min(inCare, 6) }, (_, i) => ({
    number: i + 1,
    status: i < (byStatus.get("active") ?? 0) ? "closed" : "upcoming",
  }));

  return {
    inCare,
    ringCycles,
    active: byStatus.get("active") ?? 0,
    consultsWeek: consultsWeek.count ?? 0,
    overdue: overdue.count ?? 0,
    renewals: renewals.count ?? 0,
    renewalList: renewalList.data ?? [],
    byStatus,
    memberSeries,
    consultSeries,
    reportSeries,
  };
}

const STAGES: { key: string; label: string }[] = [
  { key: "invited", label: "Invited" },
  { key: "signed_up", label: "Signed up" },
  { key: "onboarding", label: "Onboarding" },
  { key: "onboarded", label: "Onboarded" },
  { key: "assigned", label: "Assigned" },
  { key: "initial_consults", label: "Consults" },
  { key: "ready_to_start", label: "Ready" },
  { key: "active", label: "Active" },
  { key: "renewal_due", label: "Renewal due" },
];

export default async function AdminOverviewPage() {
  const a = await analytics();

  const stages: Stage[] = STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    count: a.byStatus.get(s.key) ?? 0,
    href: `/admin/members?status=${s.key}`,
  }));

  // Each tile carries its own trend, so "0" reads as "0, and here is the shape
  // behind it" rather than a number with no context. Tiles are links: the number
  // is the way into the list behind it.
  const tiles = [
    { label: "Active members", value: a.active, series: a.memberSeries as number[] | null, href: "/admin/members?status=active", tone: "var(--chart-1)" },
    { label: "Consults this week", value: a.consultsWeek, series: a.consultSeries, href: "/admin/members", tone: "var(--chart-2)" },
    { label: "Overdue reports", value: a.overdue, series: a.reportSeries, href: "/admin/members", tone: "var(--chart-3)", alert: a.overdue > 0 },
    // No honest 12-week series exists for a forward-looking count, so this tile
    // carries no sparkline rather than borrowing an unrelated one.
    { label: "Renewals (30 days)", value: a.renewals, series: null, href: "/admin/members?status=renewal_due", tone: "var(--chart-4)" },
  ];

  const throughput = a.consultSeries.map((c, i) => ({
    label: `W${i - WEEKS + 1 === 0 ? "0" : i - WEEKS + 1}`,
    Consultations: c,
    Reports: a.reportSeries[i] ?? 0,
  }));
  const hasThroughput = throughput.some((p) => p.Consultations > 0 || p.Reports > 0);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Programme health"
        title="Overview"
        description="Where every family is right now, and what moved in the last 12 weeks."
      />

      {/* M3 — the hero. The four equal tiles used to give the largest type on the
          page to four zeros; the answer to "how is the programme doing" is one
          number with a sentence, not a row of counters. */}
      <Card variant="hero" className="hero-glow">
        <CardContent className="flex flex-wrap items-center gap-x-12 gap-y-6">
          <div className="flex items-center gap-5">
            {a.active > 0 && a.ringCycles.length > 0 ? (
              <GrowthRings cycles={a.ringCycles} size={72} title="Programme cycles in flight" once />
            ) : null}
            <div>
              <p className="eyebrow">In care today</p>
              <p className="stat-figure text-foreground">{a.inCare}</p>
              <p className="text-sm text-muted-foreground">
                {a.active > 0 ? `${a.active} on an active programme` : "none started yet"}
              </p>
            </div>
          </div>

          <p className="min-w-56 max-w-md flex-1 text-[17px] leading-relaxed text-muted-foreground">
            {a.overdue > 0 ? (
              <>
                <span className="font-medium text-warning">{a.overdue} report{a.overdue === 1 ? "" : "s"} overdue</span>
                {" — the rest of the programme is running to plan."}
              </>
            ) : a.inCare === 0 ? (
              "No families in care yet. Invite a caregiver to begin."
            ) : (
              "Nothing overdue. Every family has a care team and a plan in flight."
            )}
          </p>
        </CardContent>
      </Card>

      {/* Secondary strip: the counters keep their trend but stop competing with
          the hero. A zero renders as an em-dash with a hint (M8) — a giant 0 in
          the display face reads as a broken page. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={cn(
              "pressable liftable group relative flex flex-col justify-between gap-2 overflow-hidden rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10 hover:shadow-pop hover:ring-primary/30",
              t.alert && "ring-warning/40",
            )}
          >
            {/* the trend sits BEHIND the figure as texture, not beside it */}
            {t.series && t.series.some((v) => v > 0) ? (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 opacity-70">
                <Sparkline
                  values={t.series}
                  stroke={t.tone}
                  area
                  domain="zero"
                  width={320}
                  height={44}
                  label={`${t.label}: ${WEEKS}-week trend`}
                  className="w-full"
                />
              </span>
            ) : null}
            <span className="eyebrow relative">{t.label}</span>
            <span className="relative flex items-baseline gap-2">
              <span
                className={cn(
                  "font-display text-3xl font-semibold tabular-nums",
                  t.value === 0 && "text-muted-foreground/60",
                )}
              >
                {t.value}
              </span>
              {t.value === 0 && !(t.series && t.series.some((v) => v > 0)) ? (
                <span className="text-xs text-muted-foreground">none yet</span>
              ) : null}
            </span>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Where everyone is</CardTitle>
        </CardHeader>
        <CardContent>
          <StageFunnel stages={stages} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Throughput · {WEEKS} weeks</CardTitle>
          </CardHeader>
          <CardContent>
            {hasThroughput ? (
              <TrendLine
                data={throughput}
                series={[
                  { key: "Consultations", name: "Consultations held", color: "var(--chart-2)" },
                  { key: "Reports", name: "Reports written", color: "var(--chart-1)" },
                ]}
                height={200}
              />
            ) : (
              <p className="text-muted-foreground">
                Nothing completed in the last {WEEKS} weeks yet — consultations and reports plot here
                as the care teams work.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Renewal radar</CardTitle>
          </CardHeader>
          <CardContent>
            {a.renewalList.length === 0 ? (
              <EmptyState
                icon={CalendarHeart}
                title="Nothing in the next 30 days"
                description="Families whose programme is ending appear here two weeks out, with a renewal offer already open."
              />
            ) : (
              <ul className="divide-y">
                {a.renewalList.map((p) => {
                  const m = p.members as { id: string; full_name: string; status: string };
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
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
      </div>
    </section>
  );
}
