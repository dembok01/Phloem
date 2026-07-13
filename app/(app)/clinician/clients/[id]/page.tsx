import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, FileCheck2, Lock, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Who5Card } from "@/components/charts/who5-card";
import { Monogram } from "@/components/monogram";
import { PageHeader } from "@/components/page-header";
import { RedFlagBanner } from "@/components/red-flag-banner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import { formatDateTimeIST } from "@/lib/datetime";
import { hasHighFlag, parseRedFlags } from "@/lib/red-flags";
import { humanize } from "@/lib/reports/build/helpers";
import { ClinicalForm } from "@/components/forms/ClinicalForm";
import { FeedbackForm } from "@/components/forms/FeedbackForm";
import type { FormTemplateSchema, FormValues } from "@/components/forms/types";

type CareRole = Database["public"]["Enums"]["care_role"];

const CLEARED = new Set(["cleared", "cleared_with_restrictions"]);

const TABS: Record<CareRole, [string, string][]> = {
  doctor: [
    ["overview", "Overview"],
    ["onboarding", "Onboarding"],
    ["form", "Consult form"],
    ["reports", "Reports"],
  ],
  nutritionist: [
    ["overview", "Overview"],
    ["onboarding", "Onboarding (diet)"],
    ["directives", "Doctor's directives"],
    ["form", "Consult form"],
    ["feedback", "Monthly feedback"],
    ["reports", "Reports"],
  ],
  trainer: [
    ["overview", "Overview"],
    ["onboarding", "Onboarding (activity)"],
    ["clearance", "Doctor's clearance"],
    ["form", "Consult form"],
    ["feedback", "Monthly feedback"],
    ["reports", "Reports"],
  ],
  psychologist: [
    ["context", "Context"],
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
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role as CareRole | undefined;
  if (!role || !(role in TABS)) notFound();

  // RLS mem_clinician: visible only if assigned to this member.
  const { data: member } = await supabase
    .from("members")
    .select("id, full_name, age, city, gender, status, red_flags")
    .eq("id", id)
    .maybeSingle();
  if (!member) notFound();

  const tabs = TABS[role];
  const activeTab = tabs.some(([k]) => k === tab) ? tab! : tabs[0][0];
  const flags = parseRedFlags(member.red_flags);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        crumbs={[{ label: "My members", href: "/clinician/clients" }, { label: member.full_name }]}
        title={
          <span className="flex items-center gap-3">
            <Monogram name={member.full_name} size="md" />
            <span className="flex items-center gap-2">
              {member.full_name}
              {hasHighFlag(flags) ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-danger-tint px-2.5 py-1 text-xs font-semibold text-danger"
                  title="High red flag on file"
                >
                  <ShieldAlert className="size-3.5" aria-hidden /> Flagged
                </span>
              ) : null}
            </span>
          </span>
        }
        description={[member.age ? `${member.age} yrs` : null, member.gender, member.city]
          .filter(Boolean)
          .join(" · ")}
      />

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

      {activeTab === "overview" || activeTab === "context" ? (
        <OverviewPanel role={role} flags={flags} member={member} supabase={supabase} memberId={id} />
      ) : null}
      {activeTab === "onboarding" ? <ScopedOnboardingPanel supabase={supabase} memberId={id} /> : null}
      {activeTab === "directives" ? <DirectivesPanel supabase={supabase} memberId={id} /> : null}
      {activeTab === "clearance" ? <ClearancePanel supabase={supabase} memberId={id} /> : null}
      {activeTab === "form" ? (
        <FormPanel supabase={supabase} role={role} memberId={id} userId={user.id} />
      ) : null}
      {activeTab === "feedback" ? (
        <FeedbackPanel supabase={supabase} role={role} memberId={id} userId={user.id} />
      ) : null}
      {activeTab === "reports" ? (
        <div className="space-y-4">
          {/* §3: WHO-5 renders only where psych responses are readable (psychologist/admin). */}
          {role === "psychologist" ? <Who5Card memberId={id} /> : null}
          <ReportsPanel supabase={supabase} memberId={id} />
        </div>
      ) : null}
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
}: {
  role: CareRole;
  flags: ReturnType<typeof parseRedFlags>;
  member: { status: string };
  supabase: SB;
  memberId: string;
}) {
  // Psychologist "context" = the minimal scoped RPC; others show the red-flag callout.
  const context = role === "psychologist" ? await scoped(supabase, memberId) : null;

  // What needs this clinician right now — makes Overview a launchpad, not a label.
  const { data: ownConsults } = await supabase
    .from("consultations")
    .select("meeting_status, report_status, scheduled_at")
    .eq("member_id", memberId)
    .eq("type", role);
  const formDue = (ownConsults ?? []).some((c) => c.meeting_status === "done" && c.report_status === "pending");
  const nextOwn = (ownConsults ?? [])
    .filter((c) => c.meeting_status === "scheduled" && c.scheduled_at)
    .sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1))[0];

  return (
    <div className="space-y-4">
      {role !== "psychologist" ? <RedFlagBanner flags={flags} /> : null}
      {formDue ? (
        <Link
          href={`/clinician/clients/${memberId}?tab=form`}
          className="flex items-center gap-3 rounded-xl border border-warning/50 bg-warning-tint p-4 font-medium transition-colors hover:border-warning"
        >
          <FileCheck2 className="size-5 shrink-0 text-warning" aria-hidden />
          Your consultation form is due — open it
        </Link>
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

async function latestDoctorReport(supabase: SB, memberId: string) {
  const { data } = await supabase
    .from("reports")
    .select("id, content, created_at")
    .eq("member_id", memberId)
    .in("type", ["doctor_initial", "doctor_review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

function sectionsOf(content: Json | null | undefined): { heading: string; kind: string; data: unknown }[] {
  const c = content as { sections?: { heading: string; kind: string; data: unknown }[] } | null;
  return Array.isArray(c?.sections) ? c!.sections : [];
}

async function DirectivesPanel({ supabase, memberId }: { supabase: SB; memberId: string }) {
  const report = await latestDoctorReport(supabase, memberId);
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

async function ClearancePanel({ supabase, memberId }: { supabase: SB; memberId: string }) {
  const report = await latestDoctorReport(supabase, memberId);
  const clearance =
    report && report.content && typeof report.content === "object" && !Array.isArray(report.content)
      ? (report.content as Record<string, unknown>).clearance
      : null;
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

async function ReportsPanel({ supabase, memberId }: { supabase: SB; memberId: string }) {
  const { data: reports } = await supabase
    .from("reports")
    .select("id, type, created_at")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });
  const list = reports ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reports</CardTitle>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports visible to you yet.</p>
        ) : (
          <ul className="divide-y">
            {list.map((r) => (
              <li key={r.id}>
                <Link href={`/reports/${r.id}`} className="flex items-center justify-between py-2 hover:underline">
                  <span className="text-sm font-medium">{humanize(r.type)}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTimeIST(r.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
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
  const schema = template.schema as unknown as FormTemplateSchema;

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
    const report = await latestDoctorReport(supabase, memberId);
    const clearance =
      report && report.content && typeof report.content === "object" && !Array.isArray(report.content)
        ? (report.content as Record<string, unknown>).clearance
        : null;
    if (!(typeof clearance === "string" && CLEARED.has(clearance))) {
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
        <CardContent className="flex items-center gap-2 py-8 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-5" />
          Your feedback is submitted. The performance report compiles once both are in.
        </CardContent>
      </Card>
    );
  }

  return (
    <FeedbackForm
      template={template.schema as unknown as FormTemplateSchema}
      responseId={draft.id}
      initialAnswers={(draft.answers as unknown as FormValues | null) ?? {}}
    />
  );
}
