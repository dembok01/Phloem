"use client";

// W4 — the staff side of a renewal.
//
// The split shown here is §3's, not a UI preference: a coordinator opens the offer
// and records what the family said, and only an admin can press the button that
// creates the new programme. The coordinator sees that button as a disabled note
// rather than not at all, so the handover is visible rather than mysterious.
import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarHeart, Check, PhoneCall } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  completeRenewal,
  proposeRenewal,
  recordRenewalAnswer,
} from "@/app/(app)/program-actions";

const MONTH_OPTIONS = [3, 6, 12];

const STATUS_COPY: Record<string, { label: string; variant: "default" | "muted" | "success" | "warning" }> = {
  proposed: { label: "Offer open — awaiting the family", variant: "warning" },
  interested: { label: "Family would like to continue", variant: "success" },
  declined: { label: "Family wants to talk first", variant: "muted" },
  completed: { label: "Renewed", variant: "success" },
  expired: { label: "Expired", variant: "muted" },
};

export function RenewalPanel({
  memberId,
  memberFirstName,
  isAdmin,
  hasActivePackage,
  endsOn,
  renewal,
}: {
  memberId: string;
  memberFirstName: string;
  isAdmin: boolean;
  hasActivePackage: boolean;
  endsOn: string | null;
  renewal: { id: string; status: string; proposed_months: number; decision_note: string | null } | null;
}) {
  const [months, setMonths] = React.useState(renewal?.proposed_months ?? 3);
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast("success", success);
        router.refresh();
      } else {
        toast("error", res.error ?? "That didn't work.");
      }
    });
  }

  const status = renewal ? (STATUS_COPY[renewal.status] ?? STATUS_COPY.proposed) : null;
  const settled = renewal?.status === "completed";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarHeart className="size-4 text-muted-foreground" aria-hidden /> Renewal
        </CardTitle>
        {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {endsOn
            ? `${memberFirstName}'s programme ends on ${endsOn}.`
            : "No end date set for the current programme."}
          {renewal?.decision_note ? ` Family said: “${renewal.decision_note}”` : ""}
        </p>

        {!renewal ? (
          <>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">How long should the next programme run?</legend>
              <div className="flex flex-wrap gap-1.5">
                {MONTH_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={months === m}
                    onClick={() => setMonths(m)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      months === m
                        ? "border-transparent bg-secondary text-secondary-foreground"
                        : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {m} months
                  </button>
                ))}
              </div>
            </fieldset>
            <Button
              loading={pending}
              disabled={pending || !hasActivePackage}
              onClick={() =>
                run(() => proposeRenewal({ member_id: memberId, months }), "Renewal offer opened")
              }
            >
              Open a renewal offer
            </Button>
            {!hasActivePackage ? (
              <p className="text-sm text-muted-foreground">
                There&apos;s no running programme to renew yet.
              </p>
            ) : null}
          </>
        ) : settled ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <Check className="size-4" aria-hidden /> A new programme has been created. Assign the
            care team and schedule the first consultations.
          </p>
        ) : (
          <>
            {renewal.status === "proposed" ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Record what the family said on the phone</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          recordRenewalAnswer({
                            renewal_id: renewal.id,
                            member_id: memberId,
                            intent: "interested",
                          }),
                        "Recorded — they'd like to continue",
                      )
                    }
                  >
                    <PhoneCall className="size-3.5" aria-hidden /> They&apos;d like to continue
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          recordRenewalAnswer({
                            renewal_id: renewal.id,
                            member_id: memberId,
                            intent: "declined",
                          }),
                        "Recorded — they want to talk first",
                      )
                    }
                  >
                    They want to talk first
                  </Button>
                </div>
              </div>
            ) : null}

            {isAdmin ? (
              <Button
                loading={pending}
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      completeRenewal({
                        renewal_id: renewal.id,
                        member_id: memberId,
                        months: renewal.proposed_months,
                      }),
                    "New programme created",
                  )
                }
              >
                Start the new {renewal.proposed_months}-month programme
              </Button>
            ) : (
              <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                An admin starts the new programme — reactivation is admin-only.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
