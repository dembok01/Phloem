import { cache, Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Eye, FileCheck2, Lock, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardSkeleton } from "@/components/ui/skeleton";
import { Who5Card } from "@/components/charts/who5-card";
import { Monogram, toneForRole } from "@/components/monogram";
import { PageHeader } from "@/components/page-header";
import { RedFlagBanner } from "@/components/red-flag-banner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getLens, viewRoleFor } from "@/lib/lens";
import type { Database, Json } from "@/lib/supabase/database.types";
import { formatDateTimeIST } from "@/lib/datetime";
import { hasHighFlag, parseRedFlags } from "@/lib/red-flags";
import { humanize } from "@/lib/reports/build/helpers";
import { CLEARED, resolveClearance } from "@/lib/clearance";
import { ClinicalForm } from "@/components/forms/ClinicalForm";
import { FeedbackForm } from "@/components/forms/FeedbackForm";
import { DocumentList, type DocumentRow } from "@/components/documents/document-list";
import { MeasureTrends } from "@/components/charts/measure-trends";
import { CasePanel } from "@/components/cases/case-panel";
import { MemberTimeline } from "@/components/member-timeline";
import { CompileProgressButton } from "@/components/reports/compile-progress-button";
import { ThreadPanel } from "@/components/threads/thread-panel";
import { IssueChips } from "@/components/issue-chips";
import { computeIssues, type Issue } from "@/lib/issues";
import type { FormValues } from "@/components/forms/types";
import { parseFormTemplate } from "@/components/forms/schema";

type CareRole = Database["public"]["Enums"]["care_role"];

const TABS: Record<CareRole, [string, string][]> = {
  doctor: [
    ["overview", "Overview"],
    ["onboarding", "Onboarding"],
    ["trends", "Trends"],
    ["cases", "Health matters"],
    ["timeline", "Timeline"],
    ["messages", "Messages"],
    ["form", "Consult form"],
    ["reports", "Reports"],
  ],
  nutritionist: [
    ["overview", "Overview"],
    ["onboarding", "Onboarding (diet)"],
    ["directives", "Doctor's directives"],
    ["trends", "Trends"],
    ["cases", "Health matters"],
    ["messages", "Messages"],
    ["form", "Consult form"],
    ["feedback", "Monthly feedback"],
    ["reports", "Reports"],
  ],
  trainer: [
    ["overview", "Overview"],
    ["onboarding", "Onboarding (activity)"],
    ["clearance", "Doctor's clearance"],
    ["trends", "Trends"],
    ["cases", "Health matters"],
    ["messages", "Messages"],
    ["form", "Consult form"],
    ["feedback", "Monthly feedback"],
    ["reports", "Reports"],
  ],
  psychologist: [
    ["context", "Context"],
    ["trends", "Wellbeing trend"],
    ["messages", "Messages"],
    ["form", "Check-in"],
    ["reports", "Wellbeing reports"],
  ],
};

function templateKey(role: CareRole, isInitial: boolean): string {
  if (role === "psychologist") return "psych_checkin";
  return `${role}_${isInitial ? "initial" : "review"}`;
}

export default async function ClinicianClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; tl?: string }>;
}) {
  const { id } = await params;
  const { tab, tl } = await searchParams;
  const supabase = await createClient();

  const session = await getSessionProfile();
  if (!session) notFound();

  // An admin lands here by borrowing a care-team desk (lib/lens.ts); everyone
  // else is simply themselves. `role` from here down is the desk's role, so the
  // whole page — every .eq("type", role), every panel — follows the lens without
  // knowing it exists.
  const lens = await getLens();
  const isAdminView = session.role === "admin";
  if (isAdminView && !lens) notFound();
  const role = viewRoleFor(session.role, lens) as CareRole;
  if (!(role in TABS)) notFound();

  // RLS mem_clinician: visible only if assigned to this member.
  const { data: member } = await supabase
    .from("members")
    .select("id, full_name, age, city, gender, status, red_flags")
    .eq("id", id)
    .maybeSingle();
  if (!member) notFound();

  // A borrowed desk is read-only. The consult form and monthly feedback are the
  // two surfaces the database refuses an admin (submit_clinical_form and
  // submit_feedback both require the assigned clinician), and FormPanel would
  // additionally INSERT a draft response on render — a clinical row authored by
  // someone who never held the consultation. So those tabs are simply not there.
  const tabs = isAdminView ? TABS[role].filter(([k]) => k !== "form" && k !== "feedback") : TABS[role];
  const activeTab = tabs.some(([k]) => k === tab) ? tab! : tabs[0][0];
  const flags = parseRedFlags(member.red_flags);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        crumbs={[{ label: "My members", href: "/clinician/clients" }, { label: member.full_name }]}
        title={member.full_name}
        className="sr-only"
      />

      {/* V3/M3 — the identity band. A clinician arriving here needs to know WHO,
          how old, where in the programme, and whether anything is flagged, before
          they read a single tab. That used to be a 24px title and a grey line. */}
      <Card variant="hero" className="hero-glow">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <Monogram name={member.full_name} size="xl" tone={toneForRole(role)} ring />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">
              <Link href="/clinician/clients" className="hover:text-foreground hover:underline">
                My members
              </Link>
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-balance">
              {member.full_name}
            </h1>
            <p className="text-[15px] text-muted-foreground">
              {[member.age ? `${member.age} yrs` : null, member.gender, member.city]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasHighFlag(flags) ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-danger-tint px-3 py-1.5 text-sm font-semibold text-danger"
                title="High red flag on file"
              >
                <ShieldAlert className="size-4" aria-hidden /> Flagged
              </span>
            ) : flags.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-tint px-3 py-1.5 text-sm font-medium text-warning">
                <ShieldAlert className="size-4" aria-hidden /> {flags.length} red flag
                {flags.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <nav
        className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Member sections"
      >
        <div className="flex w-max gap-1 rounded-full border bg-card p-1 shadow-card">
          {tabs.map(([key, label]) => (
            <Link
              key={key}
              href={`/clinician/clients/${id}?tab=${key}`}
              aria-current={key === activeTab ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                key === activeTab
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Panel-level streaming (T2.2): the header + tab rail paint immediately;
          the active panel's queries stream in behind a skeleton. Exactly one panel
          is non-null per request, so one Suspense boundary is active. */}
      <Suspense key={activeTab} fallback={<CardSkeleton />}>
        {activeTab === "overview" || activeTab === "context" ? (
          <OverviewPanel
            role={role}
            flags={flags}
            member={member}
            supabase={supabase}
            memberId={id}
            readOnly={isAdminView}
          />
        ) : null}
        {activeTab === "onboarding" ? <ScopedOnboardingPanel supabase={supabase} memberId={id} /> : null}
        {activeTab === "directives" ? <DirectivesPanel supabase={supabase} memberId={id} /> : null}
        {activeTab === "clearance" ? <ClearancePanel supabase={supabase} memberId={id} /> : null}
        {activeTab === "form" ? (
          <FormPanel supabase={supabase} role={role} memberId={id} userId={session.user.id} />
        ) : null}
        {activeTab === "trends" ? (
          <MeasureTrends
            memberId={id}
            title={role === "psychologist" ? "Wellbeing trend" : "Trends"}
            description={
              role === "psychologist"
                ? "Your check-in scales over time. Confidential to you and the admin."
                : "Every measurement recorded for this member, with the direction of travel. Whether a change is good is per-measure — a faster timed up-and-go is an improvement, a slower one is not."
            }
          />
        ) : null}
        {activeTab === "cases" ? (
          <CasePanel
            memberId={id}
            canEdit={role === "doctor"}
            description={
              role === "doctor"
                ? "Each problem you list at intake becomes a tracked matter with its own history. Reviews append to the open ones automatically."
                : "Long-running health matters the doctor is tracking."
            }
          />
        ) : null}
        {activeTab === "timeline" ? (
          <MemberTimeline
            memberId={id}
            filter={tl}
            basePath={`/clinician/clients/${id}?tab=timeline`}
            limit={60}
          />
        ) : null}
        {activeTab === "messages" ? (
          <ThreadPanel
            memberId={id}
            memberFirstName={member.full_name.split(" ")[0]}
            compose={role === "psychologist" ? "none" : "care_team"}
            description={
              role === "psychologist"
                ? "Your confidential channel with the admin. Care-team and family conversations are not visible here."
                : "Questions from the family, and internal notes with the rest of the care team."
            }
          />
        ) : null}
        {activeTab === "feedback" ? (
          <FeedbackPanel supabase={supabase} role={role} memberId={id} userId={session.user.id} />
        ) : null}
        {activeTab === "reports" ? (
          <div className="space-y-4">
            {/* §3: WHO-5 renders only where psych responses are readable (psychologist/admin). */}
            {role === "psychologist" ? <Who5Card memberId={id} /> : null}
            <ReportsPanel supabase={supabase} memberId={id} canCompile={role === "doctor"} />
            {role === "doctor" ? <DocumentsPanel supabase={supabase} memberId={id} /> : null}
          </div>
        ) : null}
      </Suspense>
    </section>
  );
}

type SB = Awaited<ReturnType<typeof createClient>>;

async function OverviewPanel({
  role,
  flags,
  member,
  supabase,
  memberId,
  readOnly,
}: {
  role: CareRole;
  flags: ReturnType<typeof parseRedFlags>;
  member: { status: string };
  supabase: SB;
  memberId: string;
  /** True when an admin is borrowing this desk — no write CTAs. */
  readOnly: boolean;
}) {
  // Psychologist "context" = the minimal scoped RPC; others show the red-flag callout.
  const context = role === "psychologist" ? await scoped(supabase, memberId) : null;

  // What needs this clinician right now — makes Overview a launchpad, not a label.
  const { data: ownConsults } = await supabase
    .from("consultations")
    .select("meeting_status, report_status, scheduled_at, completed_at")
    .eq("member_id", memberId)
    .eq("type", role);
  const formDue = (ownConsults ?? []).some((c) => c.meeting_status === "done" && c.report_status === "pending");
  const nextOwn = (ownConsults ?? [])
    .filter((c) => c.meeting_status === "scheduled" && c.scheduled_at)
    .sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1))[0];

  // W5 — the same computed issues the doctor's list row showed, so the two
  // surfaces never disagree about what is outstanding. Only the doctor sees this:
  // the other roles' work is already expressed by the form-due banner below.
  let issues: Issue[] = [];
  if (role === "doctor") {
    const [{ data: clearanceReports }, { data: declining }, { data: unread }, { data: engagement }] =
      await Promise.all([
        supabase
          .from("reports")
          .select("content")
          .eq("member_id", memberId)
          .in("type", ["doctor_initial", "doctor_review"])
          .order("created_at", { ascending: false }),
        supabase.rpc("my_declining_measures"),
        supabase.rpc("my_unread_threads"),
        supabase.rpc("get_engagement", { p_member: memberId }),
      ]);

    const overdue = (ownConsults ?? [])
      .filter((c) => c.meeting_status === "done" && c.report_status === "pending" && c.completed_at)
      .map((c) => (Date.now() - new Date(c.completed_at!).getTime()) / 3_600_000);

    issues = computeIssues({
      flags,
      clearance: resolveClearance((clearanceReports ?? []) as { content: unknown }[]),
      adverseEvent: false,
      reportOverdueHours: overdue.length > 0 ? Math.max(...overdue) : null,
      decliningMeasures: ((declining ?? []) as { member_id: string; label: string }[])
        .filter((d) => d.member_id === memberId)
        .map((d) => d.label),
      engagement:
        ((engagement ?? []) as { state: string }[])[0]?.state ?? "engaged",
      daysUntilProgrammeEnds: null,
      unreadMessages: ((unread ?? []) as { member_id: string; unread: number }[])
        .filter((t) => t.member_id === memberId)
        .reduce((n, t) => n + Number(t.unread), 0),
    });
  }

  return (
    <div className="space-y-4">
      {role !== "psychologist" ? <RedFlagBanner flags={flags} /> : null}
      {issues.length > 0 ? (
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <p className="eyebrow mb-2">Needs your attention</p>
          <IssueChips issues={issues} showDetail />
        </div>
      ) : null}
      {formDue && !readOnly ? (
        <Link
          href={`/clinician/clients/${memberId}?tab=form`}
          className="flex items-center gap-3 rounded-xl border border-warning/50 bg-warning-tint p-4 font-medium transition-colors hover:border-warning"
        >
          <FileCheck2 className="size-5 shrink-0 text-warning" aria-hidden />
          Your consultation form is due — open it
        </Link>
      ) : formDue ? (
        <div className="flex items-center gap-3 rounded-xl border border-warning/50 bg-warning-tint p-4 font-medium">
          <FileCheck2 className="size-5 shrink-0 text-warning" aria-hidden />
          Their consultation form is due.
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{role === "psychologist" ? "Minimal context" : "Overview"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <dl className="grid gap-1 text-sm sm:grid-cols-[minmax(140px,32%)_1fr]">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{humanize(member.status)}</dd>
            <dt className="text-muted-foreground">Your next consult</dt>
            <dd>{nextOwn ? formatDateTimeIST(nextOwn.scheduled_at) : "Nothing scheduled"}</dd>
          </dl>
          {context ? <ScopedList data={context} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}

async function scoped(supabase: SB, memberId: string): Promise<Record<string, unknown> | null> {
  const { data } = await supabase.rpc("get_onboarding_scoped", { m: memberId });
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
}

async function ScopedOnboardingPanel({ supabase, memberId }: { supabase: SB; memberId: string }) {
  const data = await scoped(supabase, memberId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboarding answers</CardTitle>
      </CardHeader>
      <CardContent>
        {data ? (
          <ScopedList data={data} />
        ) : (
          <p className="text-sm text-muted-foreground">No onboarding answers available.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ScopedList({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v != null);
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No answers.</p>;
  return (
    <dl className="grid gap-2 sm:grid-cols-[minmax(140px,32%)_1fr]">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-sm font-medium capitalize text-muted-foreground">{k.replace(/_/g, " ")}</dt>
          <dd className="text-sm">{renderScopedValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function renderScopedValue(v: unknown): string {
  if (Array.isArray(v)) {
    return v
      .map((item) =>
        item && typeof item === "object"
          ? Object.values(item as Record<string, unknown>).filter(Boolean).join(" — ")
          : String(item),
      )
      .filter(Boolean)
      .join("; ") || "—";
  }
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).filter(Boolean).join(", ");
  return v === "" || v == null ? "—" : String(v);
}

// The recent doctor reports (newest first). The clearance value is resolved by
// resolveClearance() — the TS mirror of the 0015 gate — so an unchanged review
// (no clearance key) carries the prior clearance forward. limit(6) covers a few
// review cycles while staying bounded. React.cache() memoizes per memberId so
// the panels share one fetch per render (and future co-rendered panels too).
const doctorReports = cache(async (memberId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("id, type, content, created_at")
    .eq("member_id", memberId)
    .in("type", ["doctor_initial", "doctor_review"])
    .order("created_at", { ascending: false })
    .limit(6);
  return data ?? [];
});

function sectionsOf(content: Json | null | undefined): { heading: string; kind: string; data: unknown }[] {
  const c = content as { sections?: { heading: string; kind: string; data: unknown }[] } | null;
  return Array.isArray(c?.sections) ? c!.sections : [];
}

async function DirectivesPanel({ memberId }: { supabase: SB; memberId: string }) {
  const report = (await doctorReports(memberId))[0] ?? null;
  const wanted = new Set(["Nutrition Directives", "Exercise Clearance", "Team Flags & Notes"]);
  const sections = sectionsOf(report?.content).filter((s) => wanted.has(s.heading));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Doctor&apos;s directives</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!report ? (
          <p className="text-sm text-muted-foreground">No doctor report yet.</p>
        ) : (
          <>
            {sections.map((s, i) => (
              <ReadonlySection key={i} section={s} />
            ))}
            <Link href={`/reports/${report.id}`} className="text-sm text-primary hover:underline">
              Open the full doctor report →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

async function ClearancePanel({ memberId }: { supabase: SB; memberId: string }) {
  const reports = await doctorReports(memberId);
  const report = reports[0] ?? null;
  // Clearance VALUE via the resolver (last non-empty wins); the section markup
  // still renders from the newest report row.
  const clearance = resolveClearance(reports);
  const clearanceSection = sectionsOf(report?.content).find((s) => s.heading === "Exercise Clearance");
  // Three distinct states (C4): full clearance is the only green; restrictions
  // are cautionary and render Honey with the restriction list front and centre.
  const state =
    clearance === "cleared" ? "cleared" : clearance === "cleared_with_restrictions" ? "restricted" : "hold";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Doctor&apos;s clearance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!report ? (
          <p className="text-sm text-muted-foreground">
            No doctor report yet — training cannot begin until the doctor clears this member.
          </p>
        ) : (
          <>
            <div
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4",
                state === "cleared" && "border-success/40 bg-success-tint",
                state === "restricted" && "border-warning/50 bg-warning-tint",
                state === "hold" && "border-danger/40 bg-danger-tint",
              )}
            >
              {state === "cleared" ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              ) : state === "restricted" ? (
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
              ) : (
                <Lock className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="font-semibold">
                  {state === "cleared"
                    ? "Cleared for exercise"
                    : state === "restricted"
                      ? "Cleared with restrictions — read before every session"
                      : "On hold — no training yet"}
                </p>
                {state === "restricted" ? (
                  <p className="text-sm">
                    The doctor&apos;s limits below are binding. Stay inside them until the next review.
                  </p>
                ) : null}
              </div>
            </div>
            {clearanceSection ? <ReadonlySection section={clearanceSection} /> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReadonlySection({ section }: { section: { heading: string; kind: string; data: unknown } }) {
  return (
    <div>
      <p className="mb-1 text-sm font-semibold">{section.heading}</p>
      {section.kind === "text" ? (
        <p className="whitespace-pre-line text-sm">{String(section.data)}</p>
      ) : section.kind === "kv" && section.data && typeof section.data === "object" ? (
        <dl className="grid gap-1 sm:grid-cols-[minmax(140px,32%)_1fr]">
          {Object.entries(section.data as Record<string, unknown>).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-sm text-muted-foreground">{k}</dt>
              <dd className="text-sm">{String(v)}</dd>
            </div>
          ))}
        </dl>
      ) : section.kind === "callout" && section.data && typeof section.data === "object" ? (
        <ul className="list-disc pl-5 text-sm">
          {((section.data as { items?: string[] }).items ?? []).map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

async function ReportsPanel({
  supabase,
  memberId,
  canCompile,
}: {
  supabase: SB;
  memberId: string;
  /** only the doctor compiles the progress summary on demand (the RPC agrees) */
  canCompile: boolean;
}) {
  // P-5 read receipts: fetch family (caregiver/member) opens of the reports THIS
  // clinician authored, so each row can say whether the plan was actually read.
  const [{ data: reports }, { data: receipts }] = await Promise.all([
    supabase
      .from("reports")
      .select("id, type, created_at")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false }),
    supabase.rpc("get_report_view_receipts", { p_member: memberId }),
  ]);
  const list = reports ?? [];

  // The active cycle is what a fresh summary would cover; null means "all time",
  // which is the right scope before the first cycle starts.
  const { data: activeCycle } = await supabase
    .from("cycles")
    .select("id, packages!inner(member_id)")
    .eq("packages.member_id", memberId)
    .eq("status", "active")
    .maybeSingle();
  const cycleId = activeCycle?.id ?? null;
  const hasSummary = list.some((r) => r.type === "progress_summary");
  const receiptByReport = new Map<string, { last_viewed_at: string; viewer_name: string }>();
  for (const v of receipts ?? []) {
    receiptByReport.set(v.report_id, { last_viewed_at: v.last_viewed_at, viewer_name: v.viewer_name });
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Reports</CardTitle>
        {canCompile ? (
          <CompileProgressButton memberId={memberId} cycleId={cycleId} exists={hasSummary} />
        ) : null}
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports visible to you yet.</p>
        ) : (
          <ul className="divide-y">
            {list.map((r) => {
              const receipt = receiptByReport.get(r.id);
              return (
                <li key={r.id} className="py-2">
                  <Link href={`/reports/${r.id}`} className="flex items-center justify-between hover:underline">
                    <span className="text-sm font-medium">{humanize(r.type)}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTimeIST(r.created_at)}</span>
                  </Link>
                  {receipt ? (
                    <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-success">
                      <Eye className="size-3.5" aria-hidden />
                      Opened by {receipt.viewer_name.split(" ")[0]} · {formatDateTimeIST(receipt.last_viewed_at)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// Documents the family uploaded (§ member documents, migration 0014). Rendered only
// for the doctor — RLS grants document reads to the assigned doctor + admin only.
async function DocumentsPanel({ supabase, memberId }: { supabase: SB; memberId: string }) {
  const { data: docs } = await supabase
    .from("member_documents")
    .select("id, category, file_name, storage_path, size_bytes, created_at, mime_type")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents from the family</CardTitle>
      </CardHeader>
      <CardContent>
        <DocumentList
          documents={(docs ?? []) as DocumentRow[]}
          emptyHint="The family hasn't uploaded any documents yet."
        />
      </CardContent>
    </Card>
  );
}

async function FormPanel({
  supabase,
  role,
  memberId,
  userId,
}: {
  supabase: SB;
  role: CareRole;
  memberId: string;
  userId: string;
}) {
  // The submittable consultation for this role: meeting done + report pending.
  const { data: consults } = await supabase
    .from("consultations")
    .select("id, cycle_id, meeting_status, report_status, scheduled_at")
    .eq("member_id", memberId)
    .eq("type", role);
  const submittable = (consults ?? []).find(
    (c) => c.meeting_status === "done" && c.report_status === "pending",
  );

  if (!submittable) {
    const latest = (consults ?? [])[0];
    const submitted = latest?.report_status === "submitted";
    // Post-submit is a doorway, not a dead end (C4): link to the report it made.
    const lastOwnReport = submitted
      ? (
          await supabase
            .from("reports")
            .select("id, type, created_at")
            .eq("member_id", memberId)
            .eq("created_by", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data
      : null;
    const message = !latest
      ? "No consultation yet — the coordinator will schedule one."
      : submitted
        ? "Your report for this consultation is in."
        : latest.meeting_status === "scheduled"
          ? `The form opens after the coordinator marks the meeting done (scheduled ${formatDateTimeIST(latest.scheduled_at)}).`
          : "The form opens once your meeting is scheduled and marked done.";
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          {submitted ? <CheckCircle2 className="size-6 text-success" aria-hidden /> : null}
          <p className="text-sm text-muted-foreground">{message}</p>
          {lastOwnReport ? (
            <Link
              href={`/reports/${lastOwnReport.id}`}
              className="inline-flex min-h-10 items-center rounded-full border bg-card px-4 text-sm font-medium hover:border-primary/40 hover:bg-secondary/40"
            >
              View {humanize(lastOwnReport.type).toLowerCase()} →
            </Link>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const isInitial = submittable.cycle_id === null;
  const key = templateKey(role, isInitial);
  const { data: template } = await supabase
    .from("form_templates")
    .select("id, schema")
    .eq("key", key)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!template) {
    return <Card><CardContent className="py-8 text-sm text-muted-foreground">Form template missing.</CardContent></Card>;
  }
  const schema = parseFormTemplate(template.schema);

  // W5 — the previous consultation's answers, shown BESIDE each field as reference
  // ("Last time: 128/82"). Never prefilled: copy-forward is a known charting
  // hazard, where last month's reading silently becomes this month's record. This
  // gives a doctor the speed of seeing the trend without that risk.
  const { data: lastSubmitted } = await supabase
    .from("form_responses")
    .select("answers, submitted_at")
    .eq("member_id", memberId)
    .eq("respondent_id", userId)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hints = previousValueHints(schema, lastSubmitted?.answers as Record<string, unknown> | null);

  // Ensure a draft (fr_own_clinical: respondent_id = self).
  const { data: existing } = await supabase
    .from("form_responses")
    .select("id, answers")
    .eq("consultation_id", submittable.id)
    .eq("respondent_id", userId)
    .is("submitted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let responseId = existing?.id ?? null;
  let initialAnswers: FormValues = (existing?.answers as unknown as FormValues | null) ?? {};
  if (!responseId) {
    const { data: created } = await supabase
      .from("form_responses")
      .insert({
        member_id: memberId,
        template_id: template.id,
        consultation_id: submittable.id,
        respondent_id: userId,
        answers: {} as unknown as Json,
      })
      .select("id")
      .single();
    if (!created) {
      return <Card><CardContent className="py-8 text-sm text-muted-foreground">Could not open the form.</CardContent></Card>;
    }
    responseId = created.id;
    initialAnswers = {};
  }

  // Trainer clearance gate (UI half — the RPC enforces it regardless).
  let locked = false;
  let lockedReason: string | undefined;
  if (role === "trainer") {
    const clearance = resolveClearance(await doctorReports(memberId));
    if (!(clearance !== null && CLEARED.has(clearance))) {
      locked = true;
      lockedReason =
        "Awaiting the doctor's clearance. This form unlocks once a doctor report clears the member for exercise (cleared or cleared with restrictions).";
    }
  }

  return (
    <ClinicalForm
      template={schema}
      memberId={memberId}
      consultationId={submittable.id}
      responseId={responseId}
      initialAnswers={initialAnswers}
      hints={hints}
      locked={locked}
      lockedReason={lockedReason}
    />
  );
}

// §9 monthly feedback (nutritionist/trainer). The draft is created by the cron at
// T-3; this panel keys entirely off that draft (readable via fr_own_clinical) and
// submits via submit_feedback (→ performance report). It deliberately does NOT read
// cycles/packages — clinicians have no packages RLS policy, and the draft's presence
// already signals that feedback is due for the current cycle.
async function FeedbackPanel({
  supabase,
  role,
  memberId,
  userId,
}: {
  supabase: SB;
  role: CareRole;
  memberId: string;
  userId: string;
}) {
  const key = role === "nutritionist" ? "feedback_nutrition" : "feedback_training";
  const emptyMsg = (msg: string) => (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">{msg}</CardContent>
    </Card>
  );

  const { data: template } = await supabase
    .from("form_templates")
    .select("id, schema")
    .eq("key", key)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!template) return emptyMsg("Feedback template missing.");

  // The cron-created draft for the current cycle (fr_own_clinical: respondent = self).
  const { data: draft } = await supabase
    .from("form_responses")
    .select("id, answers, submitted_at")
    .eq("member_id", memberId)
    .eq("template_id", template.id)
    .eq("respondent_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!draft) {
    return emptyMsg("No monthly feedback is due yet — it opens three days before the cycle ends.");
  }
  if (draft.submitted_at) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-success">
          <CheckCircle2 className="size-5" />
          Your feedback is submitted. The performance report compiles once both are in.
        </CardContent>
      </Card>
    );
  }

  return (
    <FeedbackForm
      template={parseFormTemplate(template.schema)}
      responseId={draft.id}
      initialAnswers={(draft.answers as unknown as FormValues | null) ?? {}}
    />
  );
}


/** Reference values from the last submission, for the fields that can carry one.
 *  Free text and long-form answers are skipped: a paragraph of last month's
 *  assessment beside the box invites copying it, which is the exact thing the
 *  reference-instead-of-prefill decision is avoiding. */
function previousValueHints(
  schema: ReturnType<typeof parseFormTemplate>,
  answers: Record<string, unknown> | null,
): Record<string, { previous: string }> {
  if (!answers) return {};
  const out: Record<string, { previous: string }> = {};
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.type === "textarea" || field.type === "repeat_group" || field.type === "info") continue;
      const raw = answers[field.id];
      if (raw === null || raw === undefined || raw === "") continue;
      const text = humanize(raw);
      if (text === "—") continue;
      out[field.id] = { previous: text };
    }
  }
  return out;
}
