import { CalendarClock, Pause, Play, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GrowthRings } from "@/components/growth-rings";
import { formatDateIST } from "@/lib/datetime";
import {
  activateProgram,
  deactivateMember,
  pauseProgram,
  reactivateMember,
  resumeProgram,
  setPackageDuration,
} from "@/app/(app)/program-actions";

const SELECT =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export type ProgramPackage = {
  id: string;
  status: "not_started" | "active" | "paused" | "completed";
  start_date: string | null;
  end_date: string | null;
  duration_months: number;
  total_paused_days: number;
  psych_override: boolean;
  paused_at: string | null;
};

export type ProgramCycle = {
  number: number;
  start_date: string;
  end_date: string;
  status: "upcoming" | "active" | "closed";
};

const MONTH_OPTIONS = [1, 2, 3, 4, 6, 12];

/** §6/§9 program lifecycle controls + cycle timeline. Every control posts to a
 * §6 RPC (the enforcement boundary). `isAdmin` gates the admin-only actions
 * (deactivate/reactivate); the RPCs reject a coordinator regardless. */
export function ProgramCard({
  memberId,
  memberStatus,
  pkg,
  cycles,
  eligibleToStart,
  psychSubmitted,
  redirectTo,
  isAdmin,
}: {
  memberId: string;
  memberStatus: string;
  pkg: ProgramPackage | null;
  cycles: ProgramCycle[];
  eligibleToStart: boolean;
  psychSubmitted: boolean;
  redirectTo: string;
  isAdmin: boolean;
}) {
  const status = pkg?.status ?? "not_started";
  const durationEditable = status === "not_started" || isAdmin;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Program</CardTitle>
        <CardAction>
          <PackageBadge status={status} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* NOT STARTED — the activation trigger */}
        {status === "not_started" ? (
          <div className="space-y-3">
            {eligibleToStart ? (
              <>
                <p className="text-sm text-muted-foreground">
                  All initial reports are in. Starting sets the program live —{" "}
                  <span className="font-medium text-foreground">it begins tomorrow</span> and generates{" "}
                  {pkg?.duration_months ?? 3} monthly cycle{(pkg?.duration_months ?? 3) === 1 ? "" : "s"}.
                </p>
                {psychSubmitted ? (
                  <form action={activateProgram}>
                    <input type="hidden" name="member_id" value={memberId} />
                    <input type="hidden" name="redirect_to" value={redirectTo} />
                    <Button type="submit">
                      <Play className="size-4" /> Start program
                    </Button>
                  </form>
                ) : (
                  // §10: psych pending → an explicit amber confirm before the override.
                  <details className="group max-w-xl rounded-xl border border-warning/40 bg-warning-tint">
                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 font-medium">
                      <Play className="size-4 shrink-0" aria-hidden />
                      Start with psychologist pending?
                    </summary>
                    <div className="space-y-3 px-4 pb-4">
                      <p className="text-sm">
                        The psychologist check-in hasn&apos;t been submitted. Starting now records a{" "}
                        <span className="font-semibold">psych override</span> in the audit log; the
                        check-in can still happen after activation.
                      </p>
                      <form action={activateProgram}>
                        <input type="hidden" name="member_id" value={memberId} />
                        <input type="hidden" name="redirect_to" value={redirectTo} />
                        <Button type="submit" variant="outline" size="sm">
                          Start program anyway
                        </Button>
                      </form>
                    </div>
                  </details>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Start becomes available once the doctor, nutritionist and trainer initial reports are submitted.
              </p>
            )}
            {pkg ? (
              <DurationForm packageId={pkg.id} current={pkg.duration_months} redirectTo={redirectTo} editable />
            ) : null}
          </div>
        ) : null}

        {/* ACTIVE / PAUSED / COMPLETED — status line + timeline */}
        {status !== "not_started" && pkg ? (
          <>
            <div className="flex items-start gap-4">
              {cycles.length > 0 ? (
                <GrowthRings
                  cycles={cycles}
                  dayOfActive={activeDay(cycles)}
                  paused={status === "paused"}
                  size={64}
                  className="mt-0.5"
                />
              ) : null}
              <dl className="grid flex-1 gap-1 text-sm sm:grid-cols-[minmax(120px,28%)_1fr]">
                <dt className="text-muted-foreground">Runs</dt>
                <dd>
                  {pkg.start_date ? formatDateIST(pkg.start_date) : "—"} → {pkg.end_date ? formatDateIST(pkg.end_date) : "—"}
                </dd>
                <dt className="text-muted-foreground">Duration</dt>
                <dd>{pkg.duration_months} month{pkg.duration_months === 1 ? "" : "s"}</dd>
                {pkg.total_paused_days > 0 ? (
                  <>
                    <dt className="text-muted-foreground">Paused days</dt>
                    <dd>{pkg.total_paused_days}</dd>
                  </>
                ) : null}
                {pkg.psych_override ? (
                  <>
                    <dt className="text-muted-foreground">Psych override</dt>
                    <dd>Started with the psychologist check-in pending</dd>
                  </>
                ) : null}
              </dl>
            </div>

            {cycles.length > 0 ? <CycleTimeline cycles={cycles} /> : null}

            <div className="flex flex-wrap items-center gap-2">
              {status === "active" ? (
                <form action={pauseProgram}>
                  <input type="hidden" name="package_id" value={pkg.id} />
                  <input type="hidden" name="redirect_to" value={redirectTo} />
                  <Button type="submit" variant="outline" size="sm">
                    <Pause className="size-4" /> Pause
                  </Button>
                </form>
              ) : null}
              {status === "paused" ? (
                <form action={resumeProgram}>
                  <input type="hidden" name="package_id" value={pkg.id} />
                  <input type="hidden" name="redirect_to" value={redirectTo} />
                  <Button type="submit" size="sm">
                    <Play className="size-4" /> Resume
                  </Button>
                </form>
              ) : null}
              {isAdmin && (status === "active" || status === "paused") ? (
                <form action={deactivateMember}>
                  <input type="hidden" name="member_id" value={memberId} />
                  <input type="hidden" name="redirect_to" value={redirectTo} />
                  <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                    Deactivate member
                  </Button>
                </form>
              ) : null}
            </div>
            {status === "paused" ? (
              <p className="text-xs text-muted-foreground">
                Resuming shifts the current cycle end, every upcoming cycle and the package end date forward by the
                number of paused days. Manually scheduled consultations are not auto-shifted — reschedule them.
              </p>
            ) : null}

            {status !== "completed" ? (
              <DurationForm
                packageId={pkg.id}
                current={pkg.duration_months}
                redirectTo={redirectTo}
                editable={durationEditable}
              />
            ) : null}
          </>
        ) : null}

        {/* REACTIVATE — admin only, once inactive/completed */}
        {isAdmin && (memberStatus === "inactive" || status === "completed") ? (
          <form action={reactivateMember} className="flex flex-wrap items-end gap-2 border-t pt-4">
            <input type="hidden" name="member_id" value={memberId} />
            <input type="hidden" name="redirect_to" value={redirectTo} />
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Reactivate — new package</span>
              <select name="months" defaultValue="3" className={SELECT} aria-label="New package duration">
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} month{m === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" size="sm">
              <RotateCcw className="size-4" /> Reactivate
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DurationForm({
  packageId,
  current,
  redirectTo,
  editable,
}: {
  packageId: string;
  current: number;
  redirectTo: string;
  editable: boolean;
}) {
  if (!editable) return null;
  return (
    <form action={setPackageDuration} className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">Package duration</span>
        <select name="months" defaultValue={String(current)} className={SELECT} aria-label="Package duration">
          {MONTH_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} month{m === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="package_id" value={packageId} />
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <Button type="submit" variant="outline" size="sm">
        Update duration
      </Button>
    </form>
  );
}

// Day-in-cycle for the rings (IST calendar days, clamped to 1..30).
function activeDay(cycles: ProgramCycle[]): number | null {
  const active = cycles.find((c) => c.status === "active");
  if (!active) return null;
  const istNow = new Date(Date.now() + 5.5 * 3600_000);
  const today = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  const start = new Date(active.start_date + "T00:00:00Z").getTime();
  return Math.min(Math.max(Math.round((today - start) / 86400_000) + 1, 1), 30);
}

function CycleTimeline({ cycles }: { cycles: ProgramCycle[] }) {
  return (
    <ol className="space-y-1.5">
      {cycles.map((c) => (
        <li key={c.number} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm">
          <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium">{`Cycle ${c.number}`}</span>
          <span className="text-muted-foreground">
            {formatDateIST(c.start_date)} → {formatDateIST(c.end_date)}
          </span>
          <span className="ml-auto">
            <CycleBadge status={c.status} />
          </span>
        </li>
      ))}
    </ol>
  );
}

function PackageBadge({ status }: { status: ProgramPackage["status"] }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "paused") return <Badge variant="warning">Paused</Badge>;
  if (status === "completed") return <Badge variant="muted">Completed</Badge>;
  return <Badge variant="muted">Not started</Badge>;
}

function CycleBadge({ status }: { status: ProgramCycle["status"] }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "closed") return <Badge variant="muted">Closed</Badge>;
  return <Badge variant="default">Upcoming</Badge>;
}
