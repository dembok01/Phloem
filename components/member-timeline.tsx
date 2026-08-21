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
//
// Each entry is a native <details>. That is the whole expansion mechanism: it
// opens on click AND on Enter/Space, it is announced as expandable, it works on
// touch where hover does not exist, and it survives with JavaScript off — which
// a hand-rolled disclosure in a server component could not do without turning
// this file into a client component. The collapsed row carries what you scan by
// (what happened, how long ago); the expansion carries what you'd otherwise have
// to open another page to learn (status, who, exact time, the round it belongs
// to) plus the link to the thing itself.
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  FileText,
  FolderOpen,
  Sprout,
  Stethoscope,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { formatDateIST, formatDateTimeIST, relativeDayIST } from "@/lib/datetime";
import { humanize } from "@/lib/reports/build/helpers";

type Kind = "consult" | "report" | "cycle" | "case" | "document";

type Fact = { label: string; value: string };

type Item = {
  at: string;
  kind: Kind;
  /** care role, when the entry has one — colours the dot (V3/M4) */
  role?: string;
  title: string;
  detail?: string;
  href?: string;
  /** what the expansion shows; the row is only expandable when this is non-empty */
  facts?: Fact[];
  /** call to action on the expansion, when `href` is set */
  action?: string;
};

const KIND_META: Record<Kind, { label: string; icon: typeof FileText; tint: string }> = {
  consult: { label: "Consultations", icon: CalendarClock, tint: "bg-info-tint text-info" },
  report: { label: "Reports", icon: FileText, tint: "bg-secondary text-secondary-foreground" },
  cycle: { label: "Programme", icon: Sprout, tint: "bg-warning-tint text-warning" },
  case: { label: "Health matters", icon: Stethoscope, tint: "bg-danger-tint text-danger" },
  document: { label: "Documents", icon: FolderOpen, tint: "bg-muted text-muted-foreground" },
};

/** V3/M4 — a consultation dot takes its care role's hue, so a long timeline reads
 *  as bands of who was involved rather than one undifferentiated grey column. */
const ROLE_TINT: Record<string, string> = {
  doctor: "bg-role-doctor/12 text-role-doctor",
  nutritionist: "bg-role-nutritionist/12 text-role-nutritionist",
  trainer: "bg-role-trainer/12 text-role-trainer",
  psychologist: "bg-role-psychologist/12 text-role-psychologist",
};

const MEETING_STATUS: Record<string, string> = {
  done: "Held",
  cancelled: "Cancelled",
  scheduled: "Scheduled",
  no_show: "Missed",
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
      supabase
        .from("reports")
        .select("id, type, created_at, cycle_id, version")
        .eq("member_id", memberId),
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
    const roleTone = c.type as string;
    const status = MEETING_STATUS[c.meeting_status as string] ?? humanize(c.meeting_status ?? "");
    const round = c.cycle_id ? "Monthly round" : "First round";
    // §3: the psychologist's session is acknowledged, never characterised — which
    // holds for the expansion too, so it gets status and timing and nothing else.
    const isPsych = c.type === "psychologist";
    const title = isPsych
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
      role: roleTone,
      title,
      detail: `${round} · ${formatDateTimeIST(when)}`,
      facts: [
        ...(isPsych ? [] : [{ label: "With", value: humanize(c.type) }]),
        { label: "Status", value: status },
        { label: "When", value: formatDateTimeIST(when) },
        { label: "Round", value: round },
        ...(c.completed_at && c.scheduled_at && c.completed_at !== c.scheduled_at
          ? [{ label: "Booked for", value: formatDateTimeIST(c.scheduled_at) }]
          : []),
      ],
    });
  }

  for (const r of reports ?? []) {
    items.push({
      at: r.created_at,
      kind: "report",
      title: `${humanize(r.type)} written`,
      detail: formatDateTimeIST(r.created_at),
      href: `/reports/${r.id}`,
      action: "Read the report",
      facts: [
        { label: "Report", value: humanize(r.type) },
        { label: "Written", value: formatDateTimeIST(r.created_at) },
        ...(r.version > 1 ? [{ label: "Version", value: `v${r.version}` }] : []),
      ],
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const cy of cycles ?? []) {
    const runs = `${formatDateIST(cy.start_date)} → ${formatDateIST(cy.end_date)}`;
    items.push({
      at: `${cy.start_date}T00:00:00+05:30`,
      kind: "cycle",
      title: `Cycle ${cy.number} ${cy.start_date > today ? "starts" : "started"}`,
      detail: runs,
      facts: [
        { label: "Runs", value: runs },
        { label: "Status", value: humanize(cy.status) },
      ],
    });
    if (cy.status === "closed") {
      items.push({
        at: `${cy.end_date}T23:59:00+05:30`,
        kind: "cycle",
        title: `Cycle ${cy.number} closed`,
        detail: formatDateIST(cy.end_date),
        facts: [{ label: "Ran", value: runs }],
      });
    }
  }

  for (const c of cases ?? []) {
    items.push({
      at: c.opened_at,
      kind: "case",
      title: `Started tracking: ${c.title}`,
      detail: `${humanize(c.severity)} concern`,
      facts: [
        { label: "Concern", value: humanize(c.severity) },
        { label: "Status", value: humanize(c.status) },
        { label: "Opened", value: formatDateTimeIST(c.opened_at) },
        ...(c.resolved_at ? [{ label: "Resolved", value: formatDateTimeIST(c.resolved_at) }] : []),
      ],
    });
    if (c.resolved_at) {
      items.push({
        at: c.resolved_at,
        kind: "case",
        title: `Resolved: ${c.title}`,
        detail: formatDateTimeIST(c.resolved_at),
        facts: [
          { label: "Concern", value: humanize(c.severity) },
          { label: "Open for", value: daysBetween(c.opened_at, c.resolved_at) },
        ],
      });
    }
  }

  for (const doc of docs ?? []) {
    items.push({
      at: doc.created_at,
      kind: "document",
      title: `${humanize(doc.category)} uploaded`,
      detail: doc.file_name,
      facts: [
        { label: "File", value: doc.file_name },
        { label: "Kind", value: humanize(doc.category) },
        { label: "Uploaded", value: formatDateTimeIST(doc.created_at) },
      ],
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

  const nowIso = new Date().toISOString();

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
            {/* Sticky, so you always know which month you are reading in a year
                of care. The spine fades at both ends rather than stopping dead. */}
            <p className="eyebrow sticky top-0 z-10 mb-2 -mx-1 bg-card/85 px-1 py-1.5 backdrop-blur-sm">
              {g.month}
            </p>
            <ol className="relative space-y-1 before:absolute before:inset-y-2 before:left-[13px] before:w-px before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
              {g.items.map((item, i) => (
                <Entry key={i} item={item} upcoming={item.at > nowIso} />
              ))}
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

function Entry({ item, upcoming }: { item: Item; upcoming: boolean }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const facts = item.facts ?? [];
  const expandable = facts.length > 0 || Boolean(item.href);

  const dot = (
    <span
      className={cn(
        "relative z-10 mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-card transition-transform duration-150 group-hover/entry:scale-110",
        item.role ? (ROLE_TINT[item.role] ?? meta.tint) : meta.tint,
        // A dated-in-the-future entry is a plan, not a record. The dashed ring
        // says so at a glance, in the one place the eye is already looking.
        upcoming && "outline-2 outline-offset-2 outline-dashed outline-current",
      )}
    >
      <Icon className="size-3" aria-hidden />
    </span>
  );

  const heading = (
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium">{item.title}</span>
        <span className="font-data shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">
          {relativeDayIST(item.at)}
        </span>
      </span>
      {item.detail ? (
        <span className="font-data mt-0.5 block truncate text-xs text-muted-foreground">
          {item.detail}
        </span>
      ) : null}
    </span>
  );

  if (!expandable) {
    return (
      <li className="group/entry relative flex gap-3 rounded-lg py-2 pr-2 pl-0.5">
        {dot}
        {heading}
      </li>
    );
  }

  return (
    <li className="relative">
      <details className="group/entry rounded-lg transition-colors open:bg-muted/40 hover:bg-muted/50">
        <summary className="flex cursor-pointer list-none gap-3 rounded-lg py-2 pr-2 pl-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          {dot}
          {heading}
          <ChevronRight
            className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-open/entry:rotate-90"
            aria-hidden
          />
        </summary>

        <div className="space-y-2 pt-1 pr-2 pb-3 pl-9">
          {facts.length > 0 ? (
            <dl className="grid gap-1">
              {facts.map((f) => (
                <div key={f.label} className="flex gap-3 text-xs">
                  <dt className="w-20 shrink-0 text-muted-foreground">{f.label}</dt>
                  <dd className="min-w-0 font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {item.href ? (
            <Link
              href={item.href}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {item.action ?? "Open"}
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          ) : null}
        </div>
      </details>
    </li>
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

/** "4 days" — how long a concern stayed open, which two timestamps make you compute. */
function daysBetween(from: string, to: string): string {
  const days = Math.max(
    0,
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000),
  );
  return days === 0 ? "Same day" : `${days} day${days === 1 ? "" : "s"}`;
}
