import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgramCard, type ProgramCycle, type ProgramPackage } from "@/components/program-card";
import { FlashToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatDateTimeIST } from "@/lib/datetime";
import { hasHighFlag, parseRedFlags } from "@/lib/red-flags";
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
  done: "Done",
};

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
    .select("id, full_name, status, red_flags, age, city, gender")
    .eq("id", id)
    .maybeSingle();
  if (!member) notFound();

  const [{ data: consults }, { data: assignments }, { data: pkg }, { data: reports }] = await Promise.all([
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
      .select("id, type, created_at")
      .eq("member_id", id)
      .order("created_at", { ascending: false }),
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
    <section className="mx-auto max-w-4xl space-y-5">
      <Link href="/admin/members" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Members
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{member.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {member.age ? `${member.age} yrs` : "Age —"}
            {member.gender ? ` · ${member.gender}` : ""}
            {member.city ? ` · ${member.city}` : ""}
          </p>
        </div>
        <Badge variant={memberStatusVariant(member.status as MemberStatus)}>
          {MEMBER_STATUS_LABEL[member.status as MemberStatus]}
        </Badge>
      </div>

      <FlashToast ok={OKS} error={ERRORS} />

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

      {/* Reports (admin sees all — rep_admin) */}
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
    </section>
  );
}
