import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <section className="mx-auto max-w-3xl space-y-5">
      <Link href="/clinician/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Clients
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        {hasHighFlag(flags) ? <span className="size-3 rounded-full bg-destructive" title="High red flag" /> : null}
        <h1 className="text-2xl font-semibold">{member.full_name}</h1>
        <span className="text-sm text-muted-foreground">
          {member.age ? `${member.age} yrs` : ""}
          {member.gender ? ` · ${member.gender}` : ""}
          {member.city ? ` · ${member.city}` : ""}
        </span>
      </div>

      <nav className="flex flex-wrap gap-1 border-b" aria-label="Client">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            href={`/clinician/clients/${id}?tab=${key}`}
            aria-current={key === activeTab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              key === activeTab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
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
      {activeTab === "reports" ? <ReportsPanel supabase={supabase} memberId={id} /> : null}
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
  return (
    <div className="space-y-4">
      {role !== "psychologist" && flags.length > 0 ? (
        <div
          className={cn(
            "flex gap-3 rounded-lg border p-4",
            hasHighFlag(flags)
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
          )}
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Red flags — clinical review required</p>
            <ul className="list-disc pl-5">
              {flags.map((f) => (
                <li key={f.id}>
                  {f.label} — {f.severity}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{role === "psychologist" ? "Minimal context" : "Overview"}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Status: {humanize(member.status)}</p>
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
  const cleared = typeof clearance === "string" && CLEARED.has(clearance);
  const clearanceSection = sectionsOf(report?.content).find((s) => s.heading === "Exercise Clearance");
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
                "flex items-center gap-2 rounded-lg border p-3 text-sm",
                cleared
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                  : "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              {cleared ? <CheckCircle2 className="size-5" /> : <Lock className="size-5" />}
              <span className="font-medium">
                {typeof clearance === "string" ? humanize(clearance) : "Not cleared"}
              </span>
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
    const message = !latest
      ? "No consultation yet — the coordinator will schedule one."
      : latest.report_status === "submitted"
        ? "Your report for this consultation has already been submitted."
        : latest.meeting_status === "scheduled"
          ? `The form opens after the coordinator marks the meeting done (scheduled ${formatDateTimeIST(latest.scheduled_at)}).`
          : "The form opens once your meeting is scheduled and marked done.";
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">{message}</CardContent>
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
