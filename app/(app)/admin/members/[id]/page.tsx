import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MemberPhoto } from "@/components/member-photo";
import { PageHeader } from "@/components/page-header";
import { ProgramCard, type ProgramCycle, type ProgramPackage } from "@/components/program-card";
import { AdherenceCard } from "@/components/charts/adherence-card";
import { Who5Card } from "@/components/charts/who5-card";
import { MemberTimeline } from "@/components/member-timeline";
import { ThreadPanel } from "@/components/threads/thread-panel";
import { RenewalPanel } from "@/components/renewal-panel";
import { RedFlagBanner } from "@/components/red-flag-banner";
import { ReportShareToggle } from "@/components/admin/report-share-toggle";
import { DocumentList, type DocumentRow } from "@/components/documents/document-list";
import { FlashToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/server";
import { formatDateIST, formatDateTimeIST } from "@/lib/datetime";
import { parseRedFlags } from "@/lib/red-flags";
import { humanize } from "@/lib/reports/build/helpers";
import {
  CARE_ROLES,
  MEMBER_STATUS_LABEL,
  memberStatusVariant,
  type CareRole,
  type MemberStatus,
} from "@/lib/member-status";

const ROLE_LABEL: Record<CareRole, string> = {
  doctor: "Doctor",
  nutritionist: "Nutritionist",
  trainer: "Trainer",
  psychologist: "Psychologist",
};

const ERRORS: Record<string, string> = {
  invalid: "Please check the form and try again.",
  initial_incomplete: "All three initial reports (doctor, nutritionist, trainer) must be submitted first.",
  no_package: "There is no package ready to start for this member.",
  not_active: "The program isn't active.",
  not_paused: "The program isn't paused.",
  not_allowed: "You don't have permission for that action.",
  share_failed: "Couldn't change sharing. Please try again.",
  failed: "That action could not be completed. Please try again.",
};

// Toast copy repeats the verb of the button that caused it (C1).
const OKS: Record<string, string> = {
  activated: "Program activated — it starts tomorrow",
  paused: "Program paused",
  resumed: "Program resumed",
  duration_saved: "Package duration saved",
  deactivated: "Member deactivated",
  reactivated: "Member reactivated — a fresh package is ready",
  shared: "Report shared with the family",
  unshared: "Sharing turned off",
  done: "Done",
};

// Doctor + performance reports are caregiver-visible only when explicitly shared
// (§3 "🔸 if share_with_caregiver"); plans/summaries are always visible.
const SHAREABLE_TYPES = new Set(["doctor_initial", "doctor_review", "performance"]);

export default async function AdminMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const redirectTo = `/admin/members/${id}`;

  const { data: member } = await supabase
    .from("members")
    .select("id, full_name, status, red_flags, age, city, gender, photo_path")
    .eq("id", id)
    .maybeSingle();
  if (!member) notFound();

  const [
    { data: consults },
    { data: assignments },
    { data: pkg },
    { data: reports },
    { data: renewalRow },
  ] = await Promise.all([
    supabase.from("consultations").select("type, cycle_id, report_status").eq("member_id", id).is("cycle_id", null),
    supabase
      .from("assignments")
      .select("care_role, care_user_id, profiles!assignments_care_user_id_fkey(full_name)")
      .eq("member_id", id)
      .eq("active", true),
    supabase
      .from("packages")
      .select("id, status, start_date, end_date, duration_months, total_paused_days, psych_override, paused_at")
      .eq("member_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("reports")
      .select("id, type, created_at, share_with_caregiver")
      .eq("member_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("renewals")
      .select("id, status, proposed_months, decision_note")
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

  const submittedInitial = new Set(
    (consults ?? []).filter((c) => c.report_status === "submitted").map((c) => c.type),
  );
  const eligibleToStart = ["doctor", "nutritionist", "trainer"].every((t) => submittedInitial.has(t as CareRole));
  const psychSubmitted = submittedInitial.has("psychologist");

  const assignedName = new Map<string, string>();
  for (const a of assignments ?? []) {
    const prof = a.profiles as { full_name: string } | { full_name: string }[] | null;
    const name = Array.isArray(prof) ? prof[0]?.full_name : prof?.full_name;
    if (name) assignedName.set(a.care_role, name);
  }

  const redFlags = parseRedFlags(member.red_flags);

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        crumbs={[{ label: "Members", href: "/admin/members" }, { label: member.full_name }]}
        title={
          <span className="flex items-center gap-3">
            <MemberPhoto photoPath={member.photo_path} name={member.full_name} size="md" />
            {member.full_name}
          </span>
        }
        description={[member.age ? `${member.age} yrs` : null, member.gender, member.city]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <Badge variant={memberStatusVariant(member.status as MemberStatus)}>
            {MEMBER_STATUS_LABEL[member.status as MemberStatus]}
          </Badge>
        }
      />

      <FlashToast ok={OKS} error={ERRORS} />

      <RedFlagBanner flags={redFlags} />

      {/* C6 read-only insight: WHO-5 (admin-visible per §3) + adherence trends. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Who5Card memberId={member.id} />
        <AdherenceCard memberId={member.id} />
      </div>

      {/* Program lifecycle (§6/§9) — admin has the full control set incl. reactivate */}
      <ProgramCard
        memberId={member.id}
        memberStatus={member.status}
        pkg={(pkg as ProgramPackage | null) ?? null}
        cycles={(cycles ?? []) as ProgramCycle[]}
        eligibleToStart={eligibleToStart}
        psychSubmitted={psychSubmitted}
        redirectTo={redirectTo}
        isAdmin
      />

      {/* Care team (read-only summary) */}
      <Card>
        <CardHeader>
          <CardTitle>Care team</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {CARE_ROLES.map((role) => (
            <div key={role} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
              <span className="text-muted-foreground">{ROLE_LABEL[role]}</span>
              <span className="font-medium">{assignedName.get(role) ?? "Unassigned"}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Reports (admin sees all — rep_admin). Doctor & performance reports carry
          a "Shared with family" switch (P-1 / H-3); other types are always
          caregiver-visible so they show no control. */}
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {(reports ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No reports yet.</p>
          ) : (
            <ul className="divide-y">
              {(reports ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                  <Link href={`/reports/${r.id}`} className="group flex min-w-0 items-center gap-2 hover:underline">
                    <span className="truncate text-sm font-medium">{humanize(r.type)}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTimeIST(r.created_at)}</span>
                  </Link>
                  {SHAREABLE_TYPES.has(r.type) ? (
                    <ReportShareToggle reportId={r.id} memberId={member.id} shared={r.share_with_caregiver} />
                  ) : (
                    <span className="text-xs text-muted-foreground">Always shared</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AdminDocumentsCard memberId={member.id} />

      {/* C6: the member's whole story in one stream. */}
      <RenewalPanel
        memberId={member.id}
        memberFirstName={member.full_name.split(" ")[0]}
        isAdmin
        hasActivePackage={pkg?.status === "active" || pkg?.status === "paused"}
        endsOn={pkg?.end_date ? formatDateIST(pkg.end_date) : null}
        renewal={renewalRow ?? null}
      />

      <MemberTimeline memberId={member.id} />
      <ThreadPanel
        memberId={member.id}
        memberFirstName={member.full_name.split(" ")[0]}
        compose="care_team"
        description="Every conversation about this member, including the psychologist's confidential channel."
      />
    </section>
  );
}

// Documents the family uploaded (migration 0014). Admin sees all (doc_admin) and may delete.
async function AdminDocumentsCard({ memberId }: { memberId: string }) {
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("member_documents")
    .select("id, category, file_name, storage_path, size_bytes, created_at")
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
          canDelete
          emptyHint="No documents uploaded yet."
        />
      </CardContent>
    </Card>
  );
}
