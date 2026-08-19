// W1.5 — the member's care timeline: every dated thing that happened, in one
// chronological stream, grouped by month and filterable by kind.
//
// It adds NO privilege. Every source is a normal RLS-scoped read, so the same
// component shows a caregiver their permitted rows and a doctor theirs — and the
// psychologist's work is acknowledged, never described (§3: anyone who cannot see
// the wellbeing report sees only "Wellbeing check-in completed — {date}").
//
// Filtering is links + a search param rather than client state: the timeline is a
// reading surface, and a server-rendered filter keeps it working with no JS and
// leaves each view linkable.
import Link from "next/link";
import {
  CalendarClock,
  FileText,
  FolderOpen,
  Sprout,
  Stethoscope,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { formatDateIST, formatDateTimeIST } from "@/lib/datetime";
import { humanize } from "@/lib/reports/build/helpers";

type Kind = "consult" | "report" | "cycle" | "case" | "document";

type Item = {
  at: string;
  kind: Kind;
  title: string;
  detail?: string;
  href?: string;
};

const KIND_META: Record<Kind, { label: string; icon: typeof FileText; tint: string }> = {
  consult: { label: "Consultations", icon: CalendarClock, tint: "bg-info-tint text-info" },
  report: { label: "Reports", icon: FileText, tint: "bg-secondary text-secondary-foreground" },
  cycle: { label: "Programme", icon: Sprout, tint: "bg-warning-tint text-warning" },
  case: { label: "Health matters", icon: Stethoscope, tint: "bg-danger-tint text-danger" },
  document: { label: "Documents", icon: FolderOpen, tint: "bg-muted text-muted-foreground" },
};

const monthFmt = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export async function MemberTimeline({
  memberId,
  filter,
  basePath,
  limit = 40,
  title = "Care timeline",
}: {
  memberId: string;
  /** active kind filter; undefined = everything */
  filter?: string;
  /** path the filter links point at; omit to render without a filter row */
  basePath?: string;
  limit?: number;
  title?: string;
}) {
  const supabase = await createClient();
  const [{ data: consults }, { data: reports }, { data: cycles }, { data: cases }, { data: docs }] =
    await Promise.all([
      supabase
        .from("consultations")
        .select("type, cycle_id, scheduled_at, completed_at, meeting_status")
        .eq("member_id", memberId),
      supabase.from("reports").select("id, type, created_at, cycle_id").eq("member_id", memberId),
      supabase
        .from("cycles")
        .select("number, start_date, end_date, status, packages!inner(member_id)")
        .eq("packages.member_id", memberId),
      supabase
        .from("member_cases")
        .select("id, title, status, severity, opened_at, resolved_at")
        .eq("member_id", memberId),
      supabase
        .from("member_documents")
        .select("id, file_name, category, created_at")
        .eq("member_id", memberId),
    ]);

  const items: Item[] = [];

  for (const c of consults ?? []) {
    const when = c.completed_at ?? c.scheduled_at;
    if (!when) continue;
    // §3: the psychologist's session is acknowledged, never characterised.
    const title =
      c.type === "psychologist"
        ? c.meeting_status === "done"
          ? "Wellbeing check-in completed"
          : "Wellbeing check-in scheduled"
        : `${humanize(c.type)} consultation ${
            c.meeting_status === "done"
              ? "held"
              : c.meeting_status === "cancelled"
                ? "cancelled"
                : "scheduled"
          }`;
    items.push({
      at: when,
      kind: "consult",
      title,
      detail: `${c.cycle_id ? "Monthly round" : "First round"} · ${formatDateTimeIST(when)}`,
    });
  }

  for (const r of reports ?? []) {
    items.push({
      at: r.created_at,
      kind: "report",
      title: `${humanize(r.type)} written`,
      detail: formatDateTimeIST(r.created_at),
      href: `/reports/${r.id}`,
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

  for (const c of cases ?? []) {
    items.push({
      at: c.opened_at,
      kind: "case",
      title: `Started tracking: ${c.title}`,
      detail: `${humanize(c.severity)} concern`,
    });
    if (c.resolved_at) {
      items.push({ at: c.resolved_at, kind: "case", title: `Resolved: ${c.title}` });
    }
  }

  for (const doc of docs ?? []) {
    items.push({
      at: doc.created_at,
      kind: "document",
      title: `${humanize(doc.category)} uploaded`,
      detail: doc.file_name,
    });
  }

  if (items.length === 0) return null;

  const counts = new Map<Kind, number>();
  for (const i of items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);

  const active = (Object.keys(KIND_META) as Kind[]).includes(filter as Kind)
    ? (filter as Kind)
    : null;
  const shown = (active ? items.filter((i) => i.kind === active) : items)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit);

  // Month buckets: a year of care is unreadable as one flat list.
  const groups: { month: string; items: Item[] }[] = [];
  for (const item of shown) {
    const month = monthOf(item.at);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(item);
    else groups.push({ month, items: [item] });
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>{title}</CardTitle>
        {basePath ? (
          <nav className="flex flex-wrap gap-1.5" aria-label="Filter timeline">
            <FilterLink href={basePath} label="Everything" count={items.length} active={!active} />
            {(Object.keys(KIND_META) as Kind[])
              .filter((k) => (counts.get(k) ?? 0) > 0)
              .map((k) => (
                <FilterLink
                  key={k}
                  href={`${basePath}${basePath.includes("?") ? "&" : "?"}tl=${k}`}
                  label={KIND_META[k].label}
                  count={counts.get(k)!}
                  active={active === k}
                />
              ))}
          </nav>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5">
        {groups.map((g) => (
          <div key={g.month}>
            <p className="eyebrow mb-2 border-b pb-1.5">{g.month}</p>
            <ol className="relative space-y-4 before:absolute before:inset-y-1 before:left-[13px] before:w-px before:bg-border">
              {g.items.map((item, i) => {
                const meta = KIND_META[item.kind];
                const Icon = meta.icon;
                const body = (
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.detail ? (
                      <p className="font-data text-xs text-muted-foreground">{item.detail}</p>
                    ) : null}
                  </div>
                );
                return (
                  <li key={i} className="relative flex gap-3 pl-0.5">
                    <span
                      className={cn(
                        "relative z-10 mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-card",
                        meta.tint,
                      )}
                    >
                      <Icon className="size-3" aria-hidden />
                    </span>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="min-w-0 rounded-md hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
        {!active && items.length > limit ? (
          <p className="text-xs text-muted-foreground">
            Showing the {limit} most recent of {items.length} entries.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FilterLink({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-secondary text-secondary-foreground"
          : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
      <span className="font-data tabular-nums opacity-70">{count}</span>
    </Link>
  );
}

function monthOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : monthFmt.format(d);
}
