import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ClipboardList, FileText, Users, Video, Phone, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { GrowthRings, type RingCycle } from "@/components/growth-rings";
import { Monogram } from "@/components/monogram";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import type { Database } from "@/lib/supabase/database.types";
import { formatDateIST, formatDateTimeIST } from "@/lib/datetime";
import { CareTeamCard, type CareTeamMember } from "@/components/portal/care-team-card";

type MemberStatus = Database["public"]["Enums"]["member_status"];
type SB = Awaited<ReturnType<typeof createClient>>;

const STATUS_LABEL: Record<MemberStatus, string> = {
  invited: "Invitation sent",
  signed_up: "Ready to begin",
  onboarding: "Onboarding in progress",
  onboarded: "Onboarding complete",
  assigned: "Care team being set up",
  initial_consults: "First consultations underway",
  ready_to_start: "Ready to start",
  active: "Program active",
  renewal_due: "Renewal coming up",
  inactive: "Program complete",
};
function statusVariant(s: MemberStatus): "default" | "muted" | "success" | "warning" {
  if (s === "active" || s === "onboarded") return "success";
  if (s === "renewal_due") return "warning";
  if (s === "inactive" || s === "invited") return "muted";
  return "default";
}

// What's happening right now, in one plain sentence for the family.
function storyLine(status: MemberStatus, opts: { cycle?: number; total?: number; day?: number; paused?: boolean }): string {
  if (opts.paused) return "The program is paused — every remaining day is kept and shifts forward when care resumes.";
  switch (status) {
    case "signed_up":
      return "A few onboarding questions help the care team understand health, habits and goals.";
    case "onboarding":
      return "Onboarding is underway — answers save automatically, so it's safe to stop and return.";
    case "onboarded":
      return "Onboarding is done. The care coordinator is now assembling the care team.";
    case "assigned":
      return "The care team is in place. First consultations are being scheduled.";
    case "initial_consults":
      return "The care team is meeting the family — each specialist writes their plan after their consultation.";
    case "ready_to_start":
      return "All initial plans are in. The coordinator will start the program shortly.";
    case "active":
      return opts.cycle
        ? `Cycle ${opts.cycle} of ${opts.total} · Day ${opts.day} of 30 · On track`
        : "The program is running.";
    case "renewal_due":
      return "The final weeks of this package — the coordinator will reach out about what's next.";
    case "inactive":
      return "This program has finished. Every report and plan stays available here.";
    default:
      return "Your care coordinator will be in touch with the next step.";
  }
}

async function careTeam(supabase: SB, memberId: string): Promise<CareTeamMember[]> {
  const { data } = await supabase.rpc("get_care_team", { p_member: memberId });
  return Array.isArray(data) ? (data as unknown as CareTeamMember[]) : [];
}

// Whole days between an IST calendar date and today (IST), non-negative.
function istDaysBetween(startIso: string): number {
  const istNow = new Date(Date.now() + 5.5 * 3600_000);
  const today = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  const start = new Date(startIso + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((today - start) / 86400_000));
}

function greetingIST(): string {
  const h = (new Date(Date.now() + 5.5 * 3600_000)).getUTCHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function PortalHomePage({
  searchParams,
}: {
  searchParams: Promise<{ onboarded?: string; member?: string }>;
}) {
  const { onboarded, member: memberParam } = await searchParams;
  const supabase = await createClient();

  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  const isElderly = profile.role === "member";

  // RLS scopes this to the signed-in user's own member(s): mem_caregiver / mem_self.
  const { data: members } = await supabase
    .from("members")
    .select("id, full_name, status, relationship_to_caregiver")
    .order("created_at", { ascending: true });
  const list = members ?? [];

  if (isElderly) return <ElderlyHome supabase={supabase} member={list[0]} />;

  const selected = list.find((m) => m.id === memberParam) ?? list[0];
  const firstName = (profile.full_name ?? "").split(" ")[0];

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {greetingIST()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-lg text-muted-foreground">
          {selected ? `Here's how ${selected.full_name.split(" ")[0]}'s care is going.` : "Your family's care, in one place."}
        </p>
      </div>

      {onboarded ? (
        <div
          role="status"
          className="rounded-xl border border-success/30 bg-success-tint p-4 text-base text-secondary-foreground"
        >
          Onboarding submitted — thank you. Your care coordinator takes it from here and will
          assemble the care team.
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
                  aria-current={m.id === selected!.id ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium",
                    m.id === selected!.id
                      ? "border-primary bg-secondary text-secondary-foreground"
                      : "bg-card hover:bg-muted",
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
  member: { id: string; full_name: string; status: MemberStatus; relationship_to_caregiver: string | null };
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
    ? await supabase
        .from("cycles")
        .select("number, start_date, end_date, status")
        .eq("package_id", pkg.id)
        .order("number")
    : { data: [] as { number: number; start_date: string; end_date: string; status: string }[] };
  const { data: nextConsults } = await supabase
    .from("consultations")
    .select("type, scheduled_at, mode")
    .eq("member_id", member.id)
    .eq("meeting_status", "scheduled")
    .order("scheduled_at", { ascending: true })
    .limit(3);

  const cycleList = cycles ?? [];
  const active = cycleList.find((c) => c.status === "active");
  const paused = pkg?.status === "paused";
  const day = active ? Math.min(Math.max(istDaysBetween(active.start_date) + 1, 1), 30) : undefined;
  const story = storyLine(member.status, {
    cycle: active?.number,
    total: cycleList.length,
    day,
    paused,
  });

  return (
    <div className="space-y-6">
      {/* The care story card — identity, plain-language status, growth rings. */}
      <Card>
        <CardContent className="py-6">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            {cycleList.length > 0 ? (
              <div className="relative">
                <GrowthRings
                  cycles={cycleList as RingCycle[]}
                  dayOfActive={day}
                  paused={paused}
                  size={112}
                />
                <Monogram
                  name={member.full_name}
                  size="md"
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                />
              </div>
            ) : (
              <Monogram name={member.full_name} size="lg" />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              {member.relationship_to_caregiver ? (
                <p className="eyebrow">Your {member.relationship_to_caregiver}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="font-display text-2xl font-semibold">{member.full_name}</p>
                <Badge variant={paused ? "warning" : statusVariant(member.status)}>
                  {paused ? "Paused" : STATUS_LABEL[member.status]}
                </Badge>
              </div>
              <p className="text-base text-muted-foreground">{story}</p>
              {active ? (
                <p className="font-data text-xs text-muted-foreground">
                  {formatDateIST(cycleList[0]!.start_date)} → {formatDateIST(cycleList[cycleList.length - 1]!.end_date)}
                </p>
              ) : null}
              {needsOnboarding ? (
                <Link href={`/portal/onboarding/${member.id}`} className={cn(buttonVariants({ size: "lg" }), "mt-1")}>
                  {member.status === "onboarding" ? "Continue onboarding" : "Start onboarding"}
                </Link>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <PortalLink
          href={`/portal/members/${member.id}/plans`}
          icon={<ClipboardList className="size-5" />}
          label="Plans"
          hint="Nutrition & training guidance"
        />
        <PortalLink
          href={`/portal/members/${member.id}/reports`}
          icon={<FileText className="size-5" />}
          label="Reports"
          hint="Everything shared with you"
        />
        <PortalLink
          href={`/portal/members/${member.id}/schedule`}
          icon={<CalendarDays className="size-5" />}
          label="Schedule"
          hint="Upcoming consultations"
        />
      </div>

      <Card>
        <CardContent className="py-5">
          <p className="mb-3 text-base font-semibold">Next consultations</p>
          {(nextConsults ?? []).length === 0 ? (
            <p className="text-muted-foreground">
              Nothing scheduled right now. Your coordinator arranges each consultation and it will
              appear here — you&apos;ll also get a notification.
            </p>
          ) : (
            <ul className="space-y-2">
              {(nextConsults ?? []).map((c, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl border bg-background/60 px-4 py-3">
                  <ModeIcon mode={c.mode} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium capitalize">{c.type} consultation</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTimeIST(c.scheduled_at)}
                      {c.mode ? ` · ${MODE_LABEL[c.mode] ?? c.mode}` : ""}
                    </p>
                  </div>
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

const MODE_LABEL: Record<string, string> = {
  video: "Video call",
  phone: "Phone call",
  in_person: "In person",
};

function ModeIcon({ mode }: { mode: string | null }) {
  const cls = "size-4";
  const icon =
    mode === "phone" ? <Phone className={cls} /> : mode === "in_person" ? <MapPin className={cls} /> : <Video className={cls} />;
  return (
    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
      {icon}
    </span>
  );
}

async function ElderlyHome({
  supabase,
  member,
}: {
  supabase: SB;
  member?: { id: string; full_name: string };
}) {
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
    <section className="mx-auto max-w-xl space-y-8">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-semibold">
          {greetingIST()}, {member.full_name.split(" ")[0]}
        </h1>
        <p className="text-xl text-muted-foreground">Your plans, schedule and care team.</p>
      </div>
      <div className="space-y-4">
        <BigLink
          href={`/portal/members/${member.id}/plans`}
          icon={<ClipboardList className="size-7" />}
          label="My Plans"
        />
        <BigLink
          href={`/portal/members/${member.id}/schedule`}
          icon={<CalendarDays className="size-7" />}
          label="My Schedule"
        />
        <details className="rounded-2xl border bg-card shadow-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-4 rounded-2xl p-6 font-display text-2xl font-semibold hover:bg-muted">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
              <Users className="size-7" />
            </span>
            My Care Team
          </summary>
          <div className="px-6 pb-6">
            {team.length === 0 ? (
              <p className="text-muted-foreground">Being assigned — check back soon.</p>
            ) : (
              <ul className="divide-y">
                {team.map((m) => (
                  <li key={m.role} className="flex flex-wrap items-center justify-between gap-2 py-4">
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

function PortalLink({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40 hover:bg-secondary/40"
    >
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className="block truncate text-sm text-muted-foreground">{hint}</span>
      </span>
    </Link>
  );
}

function BigLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center gap-4 rounded-2xl border bg-card p-6 font-display text-2xl font-semibold shadow-card hover:bg-muted"
    >
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
        {icon}
      </span>
      {label}
    </Link>
  );
}
