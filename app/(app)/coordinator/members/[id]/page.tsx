import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, MessageCircle, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgramCard, type ProgramCycle, type ProgramPackage } from "@/components/program-card";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatDateTimeIST } from "@/lib/datetime";
import { hasHighFlag, parseRedFlags } from "@/lib/red-flags";
import { telHref, waMeLink } from "@/lib/wa";
import {
  CARE_ROLES,
  MEMBER_STATUS_LABEL,
  memberStatusVariant,
  type CareRole,
  type MemberStatus,
} from "@/lib/member-status";
import { assignCareTeam, markMeetingDone, scheduleConsultation } from "./actions";

const ROLE_LABEL: Record<CareRole, string> = {
  doctor: "Doctor",
  nutritionist: "Nutritionist",
  trainer: "Trainer",
  psychologist: "Psychologist",
};

const SELECT_CLASS =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const ERRORS: Record<string, string> = {
  invalid: "Please check the form and try again.",
  assign_failed: "Could not assign — the professional may be inactive.",
  bad_time: "Please choose a valid date and time.",
  schedule_failed: "Could not save the schedule. Please try again.",
  done_failed: "Could not mark the meeting done — is it scheduled?",
  initial_incomplete: "All three initial reports (doctor, nutritionist, trainer) must be submitted first.",
  no_package: "There is no package ready to start for this member.",
  not_active: "The program isn't active.",
  not_paused: "The program isn't paused.",
  not_allowed: "You don't have permission for that action.",
  failed: "That action could not be completed. Please try again.",
};

type Pro = {
  id: string;
  full_name: string;
  role: string;
  specialization: string | null;
  phone: string | null;
  whatsapp: string | null;
};

export default async function CoordinatorMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const supabase = await createClient();
  const redirectTo = `/coordinator/members/${id}`;

  const { data: member } = await supabase
    .from("members")
    .select("id, full_name, status, red_flags, caregiver_id, age, city")
    .eq("id", id)
    .maybeSingle();
  if (!member) notFound();

  const [{ data: contacts }, { data: consults }, { data: assignments }, { data: pros }, { data: pkg }] =
    await Promise.all([
      supabase.from("member_contacts").select("phone, whatsapp").eq("member_id", id).maybeSingle(),
      supabase
        .from("consultations")
        .select("id, type, cycle_id, meeting_status, report_status, scheduled_at, mode, meeting_link")
        .eq("member_id", id),
      supabase.from("assignments").select("care_role, care_user_id").eq("member_id", id).eq("active", true),
      supabase
        .from("profiles")
        .select("id, full_name, role, specialization, phone, whatsapp")
        .in("role", CARE_ROLES)
        .eq("status", "active")
        .order("full_name"),
      supabase
        .from("packages")
        .select("id, status, start_date, end_date, duration_months, total_paused_days, psych_override, paused_at")
        .eq("member_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const { data: cycles } = pkg
    ? await supabase
        .from("cycles")
        .select("number, start_date, end_date, status")
        .eq("package_id", pkg.id)
        .order("number")
    : { data: [] as ProgramCycle[] };

  const caregiver = member.caregiver_id
    ? (
        await supabase
          .from("profiles")
          .select("full_name, phone, whatsapp")
          .eq("id", member.caregiver_id)
          .maybeSingle()
      ).data
    : null;

  const prosByRole = new Map<string, Pro[]>();
  const proById = new Map<string, Pro>();
  for (const p of (pros ?? []) as Pro[]) {
    proById.set(p.id, p);
    const list = prosByRole.get(p.role) ?? [];
    list.push(p);
    prosByRole.set(p.role, list);
  }
  const assignedByRole = new Map<string, string>();
  for (const a of assignments ?? []) assignedByRole.set(a.care_role, a.care_user_id);

  const allConsults = consults ?? [];
  const cycleList = (cycles ?? []) as ProgramCycle[];
  const cycleNumberById = new Map<string, number>();
  // cycles fetched without id; re-fetch mapping only if a program is running.
  const activeCycle = cycleList.find((c) => c.status === "active");

  // Eligibility for activation mirrors the RPC (§6): initial (cycle_id NULL)
  // doctor/nutritionist/trainer reports submitted. Coordinator reads statuses only.
  const initialConsults = allConsults.filter((c) => c.cycle_id === null);
  const submittedInitial = new Set(
    initialConsults.filter((c) => c.report_status === "submitted").map((c) => c.type),
  );
  const eligibleToStart = ["doctor", "nutritionist", "trainer"].every((t) => submittedInitial.has(t as CareRole));
  const psychSubmitted = submittedInitial.has("psychologist");

  // Consultations worth showing now: the initial round + the active cycle's review round.
  const activeCycleConsults = await getActiveCycleConsults(supabase, id, pkg?.id ?? null);
  const shownConsults = [...initialConsults, ...activeCycleConsults].sort(
    (a, b) => CARE_ROLES.indexOf(a.type) - CARE_ROLES.indexOf(b.type),
  );
  for (const c of activeCycleConsults) if (c.cycle_id && activeCycle) cycleNumberById.set(c.cycle_id, activeCycle.number);

  const redFlags = parseRedFlags(member.red_flags);

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <Link href="/coordinator/pipeline" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pipeline
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{member.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {member.age ? `${member.age} yrs` : "Age —"}
            {member.city ? ` · ${member.city}` : ""}
          </p>
        </div>
        <Badge variant={memberStatusVariant(member.status as MemberStatus)}>
          {MEMBER_STATUS_LABEL[member.status as MemberStatus]}
        </Badge>
      </div>

      {error && ERRORS[error] ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {ERRORS[error]}
        </p>
      ) : null}
      {ok ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
          Done.
        </p>
      ) : null}

      {member.status === "renewal_due" ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          Renewal due — the package ends soon. Start the renewal conversation with the caregiver.
        </p>
      ) : null}

      {redFlags.length > 0 ? (
        <div
          className={cn(
            "flex gap-3 rounded-lg border p-4",
            hasHighFlag(redFlags)
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
          )}
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Red flags on file</p>
            <ul className="list-disc pl-5">
              {redFlags.map((f) => (
                <li key={f.id}>
                  {f.label} — {f.severity}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Contacts (§3: coordinator sees member + caregiver contact identifiers) */}
      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ContactBlock label="Member" name={member.full_name} phone={contacts?.phone} whatsapp={contacts?.whatsapp} />
          <ContactBlock
            label="Caregiver"
            name={caregiver?.full_name ?? "—"}
            phone={caregiver?.phone}
            whatsapp={caregiver?.whatsapp}
          />
        </CardContent>
      </Card>

      {/* Assign care team (§6 assign_care_team) */}
      <Card>
        <CardHeader>
          <CardTitle>Care team</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {CARE_ROLES.map((role) => {
            const options = prosByRole.get(role) ?? [];
            const assignedId = assignedByRole.get(role);
            const assigned = assignedId ? proById.get(assignedId) : undefined;
            return (
              <div key={role} className="flex flex-wrap items-center gap-3 border-b pb-3 last:border-0 last:pb-0">
                <div className="w-28 shrink-0">
                  <p className="text-sm font-medium">{ROLE_LABEL[role]}</p>
                </div>
                <div className="min-w-40 flex-1">
                  {assigned ? (
                    <span className="text-sm">
                      {assigned.full_name}
                      {assigned.specialization ? (
                        <span className="text-muted-foreground"> · {assigned.specialization}</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Unassigned</span>
                  )}
                </div>
                {options.length > 0 ? (
                  <form action={assignCareTeam} className="flex items-center gap-2">
                    <input type="hidden" name="member_id" value={member.id} />
                    <input type="hidden" name="role" value={role} />
                    <select name="user_id" defaultValue="" required className={SELECT_CLASS} aria-label={`Assign ${role}`}>
                      <option value="" disabled>
                        Select…
                      </option>
                      {options.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" variant="outline" size="sm">
                      {assigned ? "Reassign" : "Assign"}
                    </Button>
                  </form>
                ) : (
                  <span className="text-xs text-muted-foreground">No active {role}s — invite one first</span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Consultations (§10 dual chips + schedule + mark done) — initial + active cycle */}
      <Card>
        <CardHeader>
          <CardTitle>Consultations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {shownConsults.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No consultations yet — assign a care team above to create the initial rows.
            </p>
          ) : (
            shownConsults.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {ROLE_LABEL[c.type]}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {c.cycle_id ? `Cycle ${cycleNumberById.get(c.cycle_id) ?? "?"} review` : "Initial"}
                    </span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <MeetingChip status={c.meeting_status} scheduledAt={c.scheduled_at} />
                    <ReportChip status={c.report_status} />
                  </div>
                </div>

                {c.meeting_status !== "done" && c.meeting_status !== "cancelled" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <details className="group">
                      <summary className="inline-flex cursor-pointer list-none items-center rounded-lg border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted">
                        {c.meeting_status === "scheduled" ? "Reschedule" : "Schedule"}
                      </summary>
                      <form action={scheduleConsultation} className="mt-3 grid gap-2 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
                        <input type="hidden" name="member_id" value={member.id} />
                        <input type="hidden" name="consultation_id" value={c.id} />
                        <label className="text-sm">
                          <span className="mb-1 block text-muted-foreground">Date &amp; time (IST)</span>
                          <input type="datetime-local" name="at" required className={SELECT_CLASS} />
                        </label>
                        <label className="text-sm">
                          <span className="mb-1 block text-muted-foreground">Mode</span>
                          <select name="mode" defaultValue="video" className={SELECT_CLASS}>
                            <option value="video">Video</option>
                            <option value="phone">Phone</option>
                            <option value="in_person">In person</option>
                          </select>
                        </label>
                        <label className="text-sm">
                          <span className="mb-1 block text-muted-foreground">Meeting link (optional)</span>
                          <input type="url" name="link" placeholder="https://…" className={cn(SELECT_CLASS, "w-full")} />
                        </label>
                        <Button type="submit" size="sm">
                          Save
                        </Button>
                      </form>
                    </details>

                    {c.meeting_status === "scheduled" ? (
                      <form action={markMeetingDone}>
                        <input type="hidden" name="member_id" value={member.id} />
                        <input type="hidden" name="consultation_id" value={c.id} />
                        <Button type="submit" variant="outline" size="sm">
                          Mark meeting done
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}

                {c.meeting_link ? (
                  <p className="mt-2 truncate text-xs text-muted-foreground">Link: {c.meeting_link}</p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Program lifecycle (§6/§9) — the Phase 7 trigger + pause/resume/duration */}
      <ProgramCard
        memberId={member.id}
        memberStatus={member.status}
        pkg={(pkg as ProgramPackage | null) ?? null}
        cycles={cycleList}
        eligibleToStart={eligibleToStart}
        psychSubmitted={psychSubmitted}
        redirectTo={redirectTo}
        isAdmin={false}
      />
    </section>
  );
}

type SB = Awaited<ReturnType<typeof createClient>>;
type ConsultRow = {
  id: string;
  type: CareRole;
  cycle_id: string | null;
  meeting_status: string;
  report_status: string;
  scheduled_at: string | null;
  mode: string | null;
  meeting_link: string | null;
};

// The active cycle's review consultations (with their cycle_id) so the coordinator
// can schedule + mark them done for the current 30-day cycle.
async function getActiveCycleConsults(
  supabase: SB,
  memberId: string,
  packageId: string | null,
): Promise<ConsultRow[]> {
  if (!packageId) return [];
  const { data: active } = await supabase
    .from("cycles")
    .select("id")
    .eq("package_id", packageId)
    .eq("status", "active")
    .maybeSingle();
  if (!active) return [];
  const { data } = await supabase
    .from("consultations")
    .select("id, type, cycle_id, meeting_status, report_status, scheduled_at, mode, meeting_link")
    .eq("member_id", memberId)
    .eq("cycle_id", active.id);
  return (data ?? []) as ConsultRow[];
}

function ContactBlock({
  label,
  name,
  phone,
  whatsapp,
}: {
  label: string;
  name: string;
  phone: string | null | undefined;
  whatsapp: string | null | undefined;
}) {
  const wa = waMeLink(whatsapp ?? phone);
  const tel = telHref(phone ?? whatsapp);
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{name}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        {tel ? (
          <a
            href={tel}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-muted"
          >
            <Phone className="size-3.5" /> {phone ?? whatsapp}
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">No phone on file</span>
        )}
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm text-emerald-700 hover:bg-muted dark:text-emerald-400"
          >
            <MessageCircle className="size-3.5" /> WhatsApp
          </a>
        ) : null}
      </div>
    </div>
  );
}

function MeetingChip({
  status,
  scheduledAt,
}: {
  status: string;
  scheduledAt: string | null;
}) {
  if (status === "scheduled") {
    return <Badge variant="default">Scheduled · {formatDateTimeIST(scheduledAt)}</Badge>;
  }
  if (status === "done") return <Badge variant="success">Meeting done</Badge>;
  if (status === "cancelled") return <Badge variant="muted">Cancelled</Badge>;
  return <Badge variant="muted">To schedule</Badge>;
}

function ReportChip({ status }: { status: string }) {
  return status === "submitted" ? (
    <Badge variant="success">Report submitted</Badge>
  ) : (
    <Badge variant="muted">Report pending</Badge>
  );
}
