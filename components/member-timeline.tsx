// Member care timeline (C6): consultations, reports, and cycle events in one
// chronological stream — read-only from rows the caller's RLS already grants.
import { CalendarClock, FileText, Sprout } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { formatDateIST, formatDateTimeIST } from "@/lib/datetime";
import { humanize } from "@/lib/reports/build/helpers";

type Item = { at: string; kind: "consult" | "report" | "cycle"; title: string; detail?: string };

export async function MemberTimeline({ memberId }: { memberId: string }) {
  const supabase = await createClient();
  const [{ data: consults }, { data: reports }, { data: cycles }] = await Promise.all([
    supabase
      .from("consultations")
      .select("type, cycle_id, scheduled_at, completed_at, meeting_status")
      .eq("member_id", memberId),
    supabase.from("reports").select("type, created_at").eq("member_id", memberId),
    supabase
      .from("cycles")
      .select("number, start_date, end_date, status, packages!inner(member_id)")
      .eq("packages.member_id", memberId),
  ]);

  const items: Item[] = [];
  for (const c of consults ?? []) {
    const when = c.completed_at ?? c.scheduled_at;
    if (!when) continue;
    items.push({
      at: when,
      kind: "consult",
      title: `${humanize(c.type)} consultation ${c.meeting_status === "done" ? "held" : c.meeting_status === "cancelled" ? "cancelled" : "scheduled"}`,
      detail: `${c.cycle_id ? "Review round" : "Initial round"} · ${formatDateTimeIST(when)}`,
    });
  }
  for (const r of reports ?? []) {
    items.push({
      at: r.created_at,
      kind: "report",
      title: `${humanize(r.type)} written`,
      detail: formatDateTimeIST(r.created_at),
    });
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const cy of cycles ?? []) {
    items.push({
      at: `${cy.start_date}T00:00:00+05:30`,
      kind: "cycle",
      title: `Cycle ${cy.number} ${cy.start_date > today ? "starts" : "started"}`,
      detail: `${formatDateIST(cy.start_date)} → ${formatDateIST(cy.end_date)}`,
    });
    if (cy.status === "closed") {
      items.push({
        at: `${cy.end_date}T23:59:00+05:30`,
        kind: "cycle",
        title: `Cycle ${cy.number} closed`,
        detail: formatDateIST(cy.end_date),
      });
    }
  }
  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Care timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-4 before:absolute before:inset-y-1 before:left-[13px] before:w-px before:bg-border">
          {items.slice(0, 20).map((item, i) => (
            <li key={i} className="relative flex gap-3 pl-0.5">
              <span
                className={cn(
                  "relative z-10 mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-card",
                  item.kind === "report" && "bg-secondary text-secondary-foreground",
                  item.kind === "consult" && "bg-info-tint text-info",
                  item.kind === "cycle" && "bg-warning-tint text-warning",
                )}
              >
                {item.kind === "report" ? (
                  <FileText className="size-3" aria-hidden />
                ) : item.kind === "consult" ? (
                  <CalendarClock className="size-3" aria-hidden />
                ) : (
                  <Sprout className="size-3" aria-hidden />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                {item.detail ? <p className="text-xs text-muted-foreground">{item.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
