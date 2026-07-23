import { notFound } from "next/navigation";
import { MessageCircle, Phone } from "lucide-react";
import { ActivationMoment } from "@/components/activation-moment";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Monogram } from "@/components/monogram";
import { PageHeader } from "@/components/page-header";
import { ProgramCard, type ProgramCycle, type ProgramPackage } from "@/components/program-card";
import { RedFlagBanner } from "@/components/red-flag-banner";
import { ConsultStatusChips } from "@/components/status-chips";
import { FlashToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { parseRedFlags } from "@/lib/red-flags";
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

// Toast copy repeats the verb of the button that caused it (C1). "activated"
// is deliberately absent — it gets the full ActivationMoment instead.
const OKS: Record<string, string> = {
  assigned: "Assigned to the care team",
  scheduled: "Consultation scheduled",
  meeting_done: "Meeting marked done — the professional has been asked to submit their form",
  paused: "Program paused",
  resumed: "Program resumed",
  duration_saved: "Package duration saved",
  done: "Done",
};

type Pro = {
  id: string;
  full_name: string;
  role: string;
  specialization: string | null;
  phone: string | null;
  whatsapp: string | null;
};

// Cycle rows carry `id` so active-cycle consults can be matched in-memory.
type CycleRow = ProgramCycle & { id: string };

export default async function CoordinatorMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const { id } = await params;
  const { ok } = await searchParams;
  const supabase = await createClient();
  const redirectTo = `/coordinator/members/${id}`;

  const { data: member } = await supabase
    .from("members")
    .select("id, full_name, status, red_flags, caregiver_id, age, city")
    .eq("id", id)
    .maybeSingle();
  if (!member) notFound();

  const [
    { data: contacts },
    { data: consults },
    { data: assignments },
    { data: pros },
    { data: pkg },
    { data: caregiver },
  ] = await Promise.all([
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
    // Caregiver only needs member.caregiver_id (known now) → fold into the batch.
    member.caregiver_id
      ? supabase.from("profiles").select("full_name, phone, whatsapp").eq("id", member.caregiver_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Cycles depend on the package id fetched above. Select `id` so the active
  // cycle's review consultations can be filtered from the `consults` list already
  // fetched — no second consultations query, no cycle-id re-lookup.
  const { data: cycles } = pkg
    ? await supabase
        .from("cycles")
        .select("id, number, start_date, end_date, status")
        .eq("package_id", pkg.id)
        .order("number")
    : { data: [] as CycleRow[] };

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

  const allConsults = (consults ?? []) as ConsultRow[];
  const cycleList = (cycles ?? []) as CycleRow[];
  const cycleNumberById = new Map<string, number>();
  for (const c of cycleList) cycleNumberById.set(c.id, c.number);
  const activeCycle = cycleList.find((c) => c.status === "active");

  // Eligibility for activation mirrors the RPC (§6): initial (cycle_id NULL)
  // doctor/nutritionist/trainer reports submitted. Coordinator reads statuses only.
  const initialConsults = allConsults.filter((c) => c.cycle_id === null);
  const submittedInitial = new Set(
    initialConsults.filter((c) => c.report_status === "submitted").map((c) => c.type),
  );
  const eligibleToStart = ["doctor", "nutritionist", "trainer"].every((t) => submittedInitial.has(t as CareRole));
  const psychSubmitted = submittedInitial.has("psychologist");

  // Consultations worth showing now: the initial round + the active cycle's review
  // round — both filtered from the full `consults` list already fetched above.
  const activeCycleConsults = activeCycle
    ? allConsults.filter((c) => c.cycle_id === activeCycle.id)
    : [];
  const shownConsults = [...initialConsults, ...activeCycleConsults].sort(
    (a, b) => CARE_ROLES.indexOf(a.type) - CARE_ROLES.indexOf(b.type),
  );

  const redFlags = parseRedFlags(member.red_flags);

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      {ok === "activated" ? (
        <ActivationMoment
          memberName={member.full_name}
          cycles={cycleList.length || (pkg?.duration_months ?? 3)}
          startDate={pkg?.start_date ?? null}
        />
      ) : null}
      <PageHeader
        crumbs={[{ label: "Pipeline", href: "/coordinator/pipeline" }, { label: member.full_name }]}
        title={
          <span className="flex items-center gap-3">
            <Monogram name={member.full_name} size="md" />
            {member.full_name}
          </span>
        }
        description={[member.age ? `${member.age} yrs` : null, member.city].filter(Boolean).join(" · ")}
        actions={
          <Badge variant={memberStatusVariant(member.status as MemberStatus)}>
            {MEMBER_STATUS_LABEL[member.status as MemberStatus]}
          </Badge>
        }
      />

      <FlashToast ok={OKS} error={ERRORS} />

      {member.status === "renewal_due" ? (
        <p className="rounded-xl border border-warning/40 bg-warning-tint p-4 text-sm">
          Renewal due — the package ends soon. Start the renewal conversation with the caregiver.
        </p>
      ) : null}

      <RedFlagBanner flags={redFlags} />

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
                    <SubmitButton
                      variant="outline"
                      size="sm"
                      pendingText={assigned ? "Reassigning…" : "Assigning…"}
                    >
                      {assigned ? "Reassign" : "Assign"}
                    </SubmitButton>
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
                  <ConsultStatusChips
                    meeting={c.meeting_status}
                    report={c.report_status}
                    scheduledAt={c.scheduled_at}
                  />
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
                        <SubmitButton size="sm" pendingText="Saving…">
                          Save
                        </SubmitButton>
                      </form>
                    </details>

                    {c.meeting_status === "scheduled" ? (
                      <form action={markMeetingDone}>
                        <input type="hidden" name="member_id" value={member.id} />
                        <input type="hidden" name="consultation_id" value={c.id} />
                        <SubmitButton variant="outline" size="sm" pendingText="Marking…">
                          Mark meeting done
                        </SubmitButton>
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

