import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, ClipboardList, FileText, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { formatDateTimeIST } from "@/lib/datetime";
import { ProgressBar, type ProgressCycle } from "@/components/portal/progress-bar";
import { CareTeamCard, type CareTeamMember } from "@/components/portal/care-team-card";

type MemberStatus = Database["public"]["Enums"]["member_status"];
type SB = Awaited<ReturnType<typeof createClient>>;

const STATUS_LABEL: Record<MemberStatus, string> = {
  invited: "Invitation pending",
  signed_up: "Ready to begin onboarding",
  onboarding: "Onboarding in progress",
  onboarded: "Onboarding complete",
  assigned: "Care team being set up",
  initial_consults: "Initial consultations underway",
  ready_to_start: "Ready to start the program",
  active: "Program active",
  renewal_due: "Renewal due",
  inactive: "Inactive",
};
function statusVariant(s: MemberStatus): "default" | "muted" | "success" | "warning" {
  if (s === "active" || s === "onboarded") return "success";
  if (s === "renewal_due") return "warning";
  if (s === "inactive" || s === "invited") return "muted";
  return "default";
}

async function careTeam(supabase: SB, memberId: string): Promise<CareTeamMember[]> {
  const { data } = await supabase.rpc("get_care_team", { p_member: memberId });
  return Array.isArray(data) ? (data as unknown as CareTeamMember[]) : [];
}

export default async function PortalHomePage({
  searchParams,
}: {
  searchParams: Promise<{ onboarded?: string; member?: string }>;
}) {
  const { onboarded, member: memberParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isElderly = profile?.role === "member";

  // RLS scopes this to the signed-in user's own member(s): mem_caregiver / mem_self.
  const { data: members } = await supabase
    .from("members")
    .select("id, full_name, status")
    .order("created_at", { ascending: true });
  const list = members ?? [];

  if (isElderly) return <ElderlyHome supabase={supabase} member={list[0]} />;

  const selected = list.find((m) => m.id === memberParam) ?? list[0];

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">Your family portal</h1>
        <p className="text-lg text-muted-foreground">
          Plans, reports and schedules for the people in your care.
        </p>
      </div>

      {onboarded ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-5" />
          <p className="text-base">Onboarding submitted — thank you. Your care coordinator takes it from here.</p>
        </div>
      ) : null}

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="text-base">
              No one is linked to your account yet. Your care coordinator will set this up shortly.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {list.length > 1 ? (
            <div className="flex flex-wrap gap-2" aria-label="Choose a member">
              {list.map((m) => (
                <Link
                  key={m.id}
                  href={`/portal?member=${m.id}`}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm font-medium",
                    m.id === selected!.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  {m.full_name}
                </Link>
              ))}
            </div>
          ) : null}
          {selected ? <CaregiverMember supabase={supabase} member={selected} /> : null}
        </>
      )}
    </section>
  );
}

async function CaregiverMember({
  supabase,
  member,
}: {
  supabase: SB;
  member: { id: string; full_name: string; status: MemberStatus };
}) {
  const needsOnboarding = member.status === "signed_up" || member.status === "onboarding";

  const [{ data: pkg }, team] = await Promise.all([
    supabase
      .from("packages")
      .select("id, status, paused_at")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    careTeam(supabase, member.id),
  ]);
  const { data: cycles } = pkg
    ? await supabase.from("cycles").select("number, start_date, end_date, status").eq("package_id", pkg.id).order("number")
    : { data: [] as ProgressCycle[] };
  const { data: nextConsults } = await supabase
    .from("consultations")
    .select("type, scheduled_at, mode")
    .eq("member_id", member.id)
    .eq("meeting_status", "scheduled")
    .order("scheduled_at", { ascending: true })
    .limit(3);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-2xl font-semibold">{member.full_name}</p>
            <Badge variant={statusVariant(member.status)}>{STATUS_LABEL[member.status]}</Badge>
          </div>
          {needsOnboarding ? (
            <Link href={`/portal/onboarding/${member.id}`} className={cn(buttonVariants(), "h-11 self-start px-5 text-base")}>
              {member.status === "onboarding" ? "Continue onboarding" : "Start onboarding"}
            </Link>
          ) : (cycles ?? []).length > 0 ? (
            <ProgressBar cycles={(cycles ?? []) as ProgressCycle[]} paused={pkg?.status === "paused"} />
          ) : (
            <p className="text-muted-foreground">The program hasn&apos;t started yet — plans arrive once it&apos;s activated.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <PortalLink href={`/portal/members/${member.id}/plans`} icon={<ClipboardList className="size-5" />} label="Plans" />
        <PortalLink href={`/portal/members/${member.id}/reports`} icon={<FileText className="size-5" />} label="Reports" />
        <PortalLink href={`/portal/members/${member.id}/schedule`} icon={<CalendarDays className="size-5" />} label="Schedule" />
      </div>

      <Card>
        <CardContent className="py-5">
          <p className="mb-3 text-base font-medium">Next consultations</p>
          {(nextConsults ?? []).length === 0 ? (
            <p className="text-muted-foreground">No upcoming consultations scheduled.</p>
          ) : (
            <ul className="divide-y">
              {(nextConsults ?? []).map((c, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <span className="font-medium capitalize">{c.type}</span>
                  <span className="text-sm text-muted-foreground">{formatDateTimeIST(c.scheduled_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CareTeamCard team={team} />
    </div>
  );
}

async function ElderlyHome({ supabase, member }: { supabase: SB; member?: { id: string; full_name: string } }) {
  if (!member) {
    return (
      <section className="mx-auto max-w-xl">
        <Card>
          <CardContent className="py-12 text-center text-xl text-muted-foreground">
            Your care team will set up your account shortly.
          </CardContent>
        </Card>
      </section>
    );
  }
  const team = await careTeam(supabase, member.id);
  return (
    <section className="mx-auto max-w-xl space-y-6 text-lg">
      <div>
        <h1 className="text-3xl font-semibold">Hello, {member.full_name.split(" ")[0]}</h1>
        <p className="text-xl text-muted-foreground">Your plans, schedule and care team.</p>
      </div>
      <div className="space-y-4">
        <BigLink href={`/portal/members/${member.id}/plans`} icon={<ClipboardList className="size-7" />} label="My Plans" />
        <BigLink href={`/portal/members/${member.id}/schedule`} icon={<CalendarDays className="size-7" />} label="My Schedule" />
        <details className="rounded-2xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-4 p-6 text-2xl font-semibold">
            <Users className="size-7 text-primary" /> My Care Team
          </summary>
          <div className="px-6 pb-6">
            {team.length === 0 ? (
              <p className="text-muted-foreground">Being assigned — check back soon.</p>
            ) : (
              <ul className="divide-y">
                {team.map((m) => (
                  <li key={m.role} className="flex items-center justify-between py-3">
                    <span className="font-medium">{m.name}</span>
                    <span className="capitalize text-muted-foreground">{m.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </div>
    </section>
  );
}

function PortalLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border bg-card p-4 font-medium hover:bg-muted">
      <span className="text-primary">{icon}</span>
      {label}
    </Link>
  );
}

function BigLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-2xl border bg-card p-6 text-2xl font-semibold hover:bg-muted"
    >
      <span className="text-primary">{icon}</span>
      {label}
    </Link>
  );
}
