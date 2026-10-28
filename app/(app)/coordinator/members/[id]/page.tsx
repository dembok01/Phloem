import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { CardSkeleton } from "@/components/ui/skeleton";
import { SafetyDetailsCard } from "@/components/safety/safety-details-card";
import { ActivationMoment } from "@/components/activation-moment";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
import { formatDateIST } from "@/lib/datetime";
import { CheckinLinkCard } from "@/components/checkin-link-card";
import { RenewalPanel } from "@/components/renewal-panel";
import { ThreadPanel } from "@/components/threads/thread-panel";
import {
  CARE_ROLES,
  MEMBER_STATUS_LABEL,
  memberStatusVariant,
  type CareRole,
  type MemberStatus,
} from "@/lib/member-status";
import { UploadReportSheet, type UploadTarget } from "@/components/coordinator/upload-report-sheet";
import { DietReviewsCard } from "@/components/reports/diet-reviews-card";
import { RemoveUploadButton } from "@/components/reports/remove-upload-button";
import { getSessionProfile } from "@/lib/auth";
import { EditRecordSheet } from "@/components/edit-record-sheet";
import { MEMBER_CONTACTS, MEMBER_DEMOGRAPHICS } from "@/lib/member-fields";
import { updateMemberAction, updateMemberContactsAction } from "@/app/(app)/record-actions";
import { reviewTargets, slotTargets } from "@/lib/report-uploads";
import { assignCareTeam, closeReport, markMeetingDone, scheduleConsultation } from "./actions";

const ROLE_LABEL: Record<CareRole, string> = {
  doctor: "Doctor",
  nutritionist: "Nutritionist",
  trainer: "Trainer",
  psychologist: "Psychologist",
};

const SELECT_CLASS =
  "h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none transition-colors duration-(--motion-press) hover:border-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const ERRORS: Record<string, string> = {
  invalid: "Please check the form and try again.",
  assign_failed: "Could not assign — the professional may be inactive.",
  bad_time: "Please choose a valid date and time.",
  schedule_failed: "Could not save the schedule. Please try again.",
  done_failed: "Could not mark the meeting done — is it scheduled?",
  close_failed: "Could not close the report — it may already be in or closed.",
  initial_incomplete: "The doctor's initial report must be submitted first.",
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
  report_closed: "Report closed — it's off the list, and the professional has been told",
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
    .select(
      "id, full_name, status, red_flags, caregiver_id, age, city, gender, language, occupation, country, relationship_to_caregiver, safety_requested_at",
    )
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
    { data: renewalRow },
    { data: checkinRow },
    { data: uploadedReports },
    { data: dietReviews },
    me,
  ] = await Promise.all([
    supabase
      .from("member_contacts")
      .select("phone, whatsapp, email, address, pin_code, emergency_contact_name, emergency_contact_phone")
      .eq("member_id", id)
      .maybeSingle(),
    supabase
      .from("consultations")
      .select(
        "id, type, cycle_id, meeting_status, report_status, scheduled_at, completed_at, mode, meeting_link, report_closed_reason, report_closed_note, report_uploaded_by, report_uploaded_at, report_file_name",
      )
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
    supabase
      .from("renewals")
      .select("id, status, proposed_months, decision_note")
      .eq("member_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("checkin_links")
      .select("token, expires_at")
      .eq("member_id", id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // 0055: uploads this viewer may open — a coordinator's own, or all for admin (RLS).
    supabase
      .from("reports")
      .select("id, consultation_id, created_by")
      .eq("member_id", id)
      .not("consultation_id", "is", null)
      .order("created_at", { ascending: false }),
    // When each diet review happened (not what it says — §3 "status only").
    supabase.rpc("list_diet_reviews", { p_member: id }),
    getSessionProfile(),
  ]);

  const checkinToken = checkinRow?.token ?? null;
  const checkinExpires = checkinRow?.expires_at ?? null;

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
  // 0046: the doctor's initial report starts the program on its own; this is the
  // fallback for a package that was not ready when that report came in.
  const eligibleToStart = submittedInitial.has("doctor");

  // Consultations worth showing now: the initial round + the active cycle's review
  // round — both filtered from the full `consults` list already fetched above.
  const activeCycleConsults = activeCycle
    ? allConsults.filter((c) => c.cycle_id === activeCycle.id)
    : [];
  const activeDoctorConsult = activeCycleConsults.find((c) => c.type === "doctor");
  const shownConsults = [...initialConsults, ...activeCycleConsults].sort(
    (a, b) => CARE_ROLES.indexOf(a.type) - CARE_ROLES.indexOf(b.type),
  );

  const redFlags = parseRedFlags(member.red_flags);

  // 0054: the newest upload per consultation that this viewer can open.
  const uploadByConsult = new Map<string, { id: string; created_by: string | null }>();
  for (const r of uploadedReports ?? []) {
    if (r.consultation_id && !uploadByConsult.has(r.consultation_id)) uploadByConsult.set(r.consultation_id, r);
  }
  const firstName = member.full_name.split(" ")[0];
  // Every report a file can stand in for, across every cycle (the RPCs re-check it),
  // then one diet-review choice per cycle that has begun.
  const uploadSlots = slotTargets(allConsults, cycleNumberById);
  const reviewsPerCycle = new Map<string, number>();
  for (const r of dietReviews ?? []) reviewsPerCycle.set(r.cycle_id, (reviewsPerCycle.get(r.cycle_id) ?? 0) + 1);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const uploadTargets: UploadTarget[] = [...uploadSlots, ...reviewTargets(cycleList, reviewsPerCycle, today)];
  const slotIds = new Set(uploadSlots.map((s) => s.id));
  // Uploaders are coordinators or admins, who aren't in the care-team list above.
  const otherUploaders = [
    ...new Set(
      allConsults
        .map((c) => c.report_uploaded_by)
        .filter((u): u is string => !!u && u !== me?.user.id),
    ),
  ];
  const { data: uploaderRows } = otherUploaders.length
    ? await supabase.from("profiles").select("id, full_name").in("id", otherUploaders)
    : { data: [] as { id: string; full_name: string }[] };
  const uploaderName = new Map((uploaderRows ?? []).map((p) => [p.id, p.full_name]));

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
          <div className="flex items-center gap-2">
            <Badge variant={memberStatusVariant(member.status as MemberStatus)}>
              {MEMBER_STATUS_LABEL[member.status as MemberStatus]}
            </Badge>
            {/* 0057: the coordinator corrects what was entered at enrolment. */}
            <EditRecordSheet
              group={MEMBER_DEMOGRAPHICS}
              role="coordinator"
              values={member}
              title="Edit member details"
              description="Corrections apply everywhere, including the onboarding answers the doctor reads."
              triggerLabel="Edit details"
              successText="Member details updated"
              onSave={updateMemberAction.bind(null, member.id)}
            />
          </div>
        }
      />

      <FlashToast ok={OKS} error={ERRORS} />

      {member.status === "renewal_due" ? (
        <p className="rounded-xl border border-warning/40 bg-warning-tint p-4 text-sm">
          Renewal due — the package ends soon. Start the renewal conversation with the caregiver.
        </p>
      ) : null}

      <RedFlagBanner flags={redFlags} />

      {/* A no-login check-in link for families who don't use the portal. It is
          its own card, so it sits here unwrapped. */}
      <CheckinLinkCard
        memberId={member.id}
        memberFirstName={member.full_name.split(" ")[0]}
        existingToken={checkinToken}
        whatsapp={contacts?.whatsapp ?? contacts?.phone ?? caregiver?.whatsapp ?? null}
        expiresAt={checkinExpires ? formatDateIST(checkinExpires) : null}
      />

      {/* Contacts (§3: coordinator sees member + caregiver contact identifiers) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Contacts</CardTitle>
          <EditRecordSheet
            group={MEMBER_CONTACTS}
            role="coordinator"
            values={contacts ?? {}}
            title="Edit contact details"
            description="The member's own contact details. Only the family, coordinators and admin can see these."
            triggerLabel="Edit contacts"
            successText="Contact details updated"
            onSave={updateMemberContactsAction.bind(null, member.id)}
          />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ContactBlock label="Member" name={member.full_name} phone={contacts?.phone} whatsapp={contacts?.whatsapp} />
          <ContactBlock
            label="Caregiver"
            name={caregiver?.full_name ?? "—"}
            phone={caregiver?.phone}
            whatsapp={caregiver?.whatsapp}
          />
          {/* The rest of the member's contact record, so a correction shows here. */}
          {(["email", "address", "pin_code", "emergency_contact_name", "emergency_contact_phone"] as const).some(
            (k) => contacts?.[k],
          ) ? (
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:col-span-2 sm:grid-cols-[auto_1fr]">
              {MEMBER_CONTACTS.fields
                .filter((f) => !["phone", "whatsapp"].includes(f.key))
                .map((f) => {
                  const v = (contacts as Record<string, string | null> | null)?.[f.key];
                  return v ? (
                    <div key={f.key} className="contents">
                      <dt className="text-muted-foreground">{f.label}</dt>
                      <dd className="break-words">{v}</dd>
                    </div>
                  ) : null;
                })}
            </dl>
          ) : null}
        </CardContent>
      </Card>

      {/* Emergency & Safety (0059): the record, or the two ways to get it. */}
      <Suspense fallback={<CardSkeleton />}>
        <SafetyDetailsCard
          memberId={member.id}
          memberName={member.full_name}
          status={member.status}
          caregiver={caregiver ?? null}
          requestedAt={member.safety_requested_at}
        />
      </Suspense>

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
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Consultations</CardTitle>
          {uploadTargets.length > 0 ? (
            <UploadReportSheet memberId={member.id} memberName={firstName} targets={uploadTargets} />
          ) : null}
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

                {/* 0048 — the manual override for "Chase the report": the report came
                    in another way (e.g. WhatsApp), or isn't needed at all. */}
                {c.meeting_status === "done" && c.report_status === "pending" ? (
                  <details className="group mt-3">
                    <summary className="inline-flex cursor-pointer list-none items-center rounded-lg border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted">
                      Close report manually
                    </summary>
                    <form action={closeReport} className="mt-3 space-y-3">
                      <input type="hidden" name="member_id" value={member.id} />
                      <input type="hidden" name="consultation_id" value={c.id} />
                      <fieldset className="space-y-2 text-sm">
                        <legend className="mb-1 text-muted-foreground">Why is it being closed?</legend>
                        <label className="flex items-start gap-2">
                          <input type="radio" name="reason" value="received_outside" required className="mt-1" />
                          <span>
                            Received outside the dashboard
                            <span className="block text-xs text-muted-foreground">
                              e.g. sent on WhatsApp — it counts as their plan
                            </span>
                          </span>
                        </label>
                        <label className="flex items-start gap-2">
                          <input type="radio" name="reason" value="not_needed" className="mt-1" />
                          <span>Not needed</span>
                        </label>
                      </fieldset>
                      <label className="block text-sm">
                        <span className="mb-1 block text-muted-foreground">Note (optional)</span>
                        <input
                          type="text"
                          name="note"
                          maxLength={200}
                          placeholder="e.g. Sona sent the plan on WhatsApp, 20 Sep"
                          className={cn(SELECT_CLASS, "w-full")}
                        />
                      </label>
                      <SubmitButton size="sm" variant="outline" pendingText="Closing…">
                        Close report
                      </SubmitButton>
                    </form>
                  </details>
                ) : null}
                {c.report_status === "closed" ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Closed by the coordinator —{" "}
                    {c.report_closed_reason === "received_outside" ? "received outside the dashboard" : "not needed"}
                    {c.report_closed_note ? ` · ${c.report_closed_note}` : ""}
                  </p>
                ) : null}

                {/* 0055 — attach the file a clinician sent outside the dashboard. A
                    nutritionist's cycle review is a diet review for that cycle. */}
                {(slotIds.has(c.id) && c.report_status !== "submitted") ||
                (c.type === "nutritionist" && c.cycle_id && c.report_status === "pending" &&
                  c.meeting_status !== "cancelled") ? (
                  <div className="mt-3">
                    <UploadReportSheet
                      memberId={member.id}
                      memberName={firstName}
                      targets={uploadTargets}
                      preselect={slotIds.has(c.id) ? c.id : (c.cycle_id ?? undefined)}
                      triggerLabel={slotIds.has(c.id) ? "Upload the report" : "Upload the diet review"}
                      triggerVariant="secondary"
                    />
                  </div>
                ) : null}
                {c.report_uploaded_by ? (
                  <UploadedLine
                    consult={c}
                    memberId={member.id}
                    memberName={firstName}
                    targets={uploadTargets}
                    replaceable={slotIds.has(c.id)}
                    upload={uploadByConsult.get(c.id) ?? null}
                    canRemove={
                      me?.role === "admin" || uploadByConsult.get(c.id)?.created_by === me?.user.id
                    }
                    uploaderName={
                      c.report_uploaded_by === me?.user.id
                        ? "you"
                        : (uploaderName.get(c.report_uploaded_by) ?? "the coordinator")
                    }
                  />
                ) : null}

                {c.meeting_link ? (
                  <p className="mt-2 truncate text-xs text-muted-foreground">Link: {c.meeting_link}</p>
                ) : null}
              </div>
            ))
          )}
          {/* 0053: a month's review round runs from the doctor. Until the doctor's
              consultation is marked done there is nothing else to schedule — say so,
              rather than leave an empty-looking month. */}
          {activeCycle && activeCycle.number > 1 && activeDoctorConsult?.meeting_status !== "done" ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Cycle {activeCycle.number}: the {ROLE_LABEL.nutritionist.toLowerCase()} and{" "}
              {ROLE_LABEL.trainer.toLowerCase()} reviews open once the doctor&apos;s consultation
              for this cycle is marked done.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {me ? (
        <DietReviewsCard
          memberId={member.id}
          memberName={firstName}
          cycles={cycleList}
          reviews={dietReviews ?? []}
          viewer={{ id: me.user.id, role: me.role }}
        />
      ) : null}

      {/* Program lifecycle (§6/§9) — the Phase 7 trigger + pause/resume/duration */}
      <ProgramCard
        memberId={member.id}
        memberStatus={member.status}
        pkg={(pkg as ProgramPackage | null) ?? null}
        cycles={cycleList}
        eligibleToStart={eligibleToStart}
        redirectTo={redirectTo}
        isAdmin={false}
      />

      <RenewalPanel
        memberId={member.id}
        memberFirstName={member.full_name.split(" ")[0]}
        isAdmin={false}
        hasActivePackage={pkg?.status === "active" || pkg?.status === "paused"}
        endsOn={pkg?.end_date ? formatDateIST(pkg.end_date) : null}
        renewal={renewalRow ?? null}
      />

      {/* The coordinator is the hinge between the family and the clinicians, so
          they see both the family threads and the internal ones — and can start
          an internal note. */}
      <ThreadPanel
        memberId={member.id}
        memberFirstName={member.full_name.split(" ")[0]}
        compose="care_team"
        description="Questions from the family and internal notes with the care team."
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
  report_closed_reason: string | null;
  report_closed_note: string | null;
  completed_at: string | null;
  report_uploaded_by: string | null;
  report_uploaded_at: string | null;
  report_file_name: string | null;
};

/** 0055: what was uploaded for this consultation, with View / Replace / Remove. View
 * appears only when this viewer can open the file (their own upload, or admin). */
function UploadedLine({
  consult,
  memberId,
  memberName,
  targets,
  replaceable,
  upload,
  canRemove,
  uploaderName,
}: {
  consult: ConsultRow;
  memberId: string;
  memberName: string;
  targets: UploadTarget[];
  replaceable: boolean;
  upload: { id: string } | null;
  canRemove: boolean;
  uploaderName: string;
}) {
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
      <p>
        Report uploaded by {uploaderName}
        {consult.report_uploaded_at ? ` on ${formatDateIST(consult.report_uploaded_at)}` : ""}
        {consult.report_file_name ? (
          <span className="text-muted-foreground"> · {consult.report_file_name}</span>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {upload ? (
          <a
            href={`/api/reports/${upload.id}/pdf?view=1`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            View the file
          </a>
        ) : null}
        {replaceable ? (
          <UploadReportSheet
            memberId={memberId}
            memberName={memberName}
            targets={targets}
            preselect={consult.id}
            triggerLabel="Replace the file"
          />
        ) : null}
        {canRemove && upload ? <RemoveUploadButton memberId={memberId} reportId={upload.id} /> : null}
      </div>
    </div>
  );
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
          <a href={tel} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "tabular-nums")}>
            <Phone aria-hidden /> {phone ?? whatsapp}
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">No phone on file</span>
        )}
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-success hover:text-success")}
          >
            <MessageCircle aria-hidden /> WhatsApp
          </a>
        ) : null}
      </div>
    </div>
  );
}

