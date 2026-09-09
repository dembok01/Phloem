"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { normalizeMemberName } from "@/lib/member-duplicates";
import type { MemberDeletionState } from "@/lib/member-deletion";

/**
 * Permanent deletion of a member, for the mis-enrolments that used to be
 * uncorrectable (0034).
 *
 * Confirmation is a typed name rather than a modal — this design system has no
 * dialog primitive, and typing the name is the stronger guard anyway: a modal
 * asks "are you sure", a typed name asks "which member". The button stays
 * disabled until it matches, and `delete_member` re-checks the same
 * normalisation server-side, so a caller skipping this form gains nothing.
 */
export function MemberDangerZone({
  memberId,
  memberName,
  blastRadius,
  action,
}: {
  memberId: string;
  memberName: string;
  /** What the cascade will take, counted at render: [["reports", 2], …]. */
  blastRadius: readonly (readonly [string, number])[];
  action: (state: MemberDeletionState, formData: FormData) => Promise<MemberDeletionState>;
}) {
  const [state, formAction] = useActionState<MemberDeletionState, FormData>(action, null);
  const [typed, setTyped] = React.useState("");

  const matches = normalizeMemberName(typed) === normalizeMemberName(memberName);

  // No success branch here on purpose: the action redirects to the member list
  // itself, so `state` only ever carries a failure worth showing inline.

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-4" aria-hidden />
          Delete this member
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          For duplicates and mis-enrolments. This permanently removes{" "}
          <strong className="text-foreground">{memberName}</strong> and everything
          recorded against them. It cannot be undone — the deletion itself is kept in
          the audit log.
        </p>

        {blastRadius.length > 0 ? (
          <ul className="grid gap-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm sm:grid-cols-2">
            {blastRadius.map(([label, count]) => (
              <li key={label} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Nothing else is recorded against this member yet.
          </p>
        )}

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="member_id" value={memberId} />
          <div className="space-y-1.5">
            <Label htmlFor="confirm_name">
              Type <span className="font-medium text-foreground">{memberName}</span> to
              confirm
            </Label>
            <Input
              id="confirm_name"
              name="confirm_name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              placeholder={memberName}
              aria-describedby="confirm_name_help"
            />
            <p id="confirm_name_help" className="text-xs text-muted-foreground">
              Case and spacing don&apos;t matter.
            </p>
          </div>

          {state && !state.ok ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <SubmitButton variant="destructive" disabled={!matches} pendingText="Deleting…">
            Delete permanently
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
