"use client";

import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import type { PendingCaregiverLink } from "@/lib/member-enrollment";

/**
 * The stop between "enroll" and "linked to an existing family".
 *
 * A caregiver account already answers to this address, so no invite can be
 * minted — the member has to be attached to that account directly. The danger
 * is a mistyped address that happens to belong to a different family: that
 * would silently hand them a stranger's health record. So the account is named,
 * along with who is already on it, and nothing is written until the coordinator
 * says it is the right one.
 */
export function CaregiverLinkConfirm({
  pending,
  formAction,
  onCancel,
}: {
  pending: PendingCaregiverLink;
  formAction: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const who = pending.caregiverName ?? pending.caregiverEmail;

  return (
    <Card className="border-amber-600/40">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-amber-600/10 p-2 text-amber-700 dark:text-amber-400">
            <Users aria-hidden className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle>This email already has an account</CardTitle>
            <p className="text-sm text-muted-foreground">
              Nothing has been saved yet. Check this is the right family before continuing.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <dl className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Existing caregiver
            </dt>
            <dd className="mt-1 font-medium">{who}</dd>
            <dd className="break-all text-sm text-muted-foreground">{pending.caregiverEmail}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Already caring for
            </dt>
            <dd className="mt-1 font-medium">
              {pending.existingMembers.length > 0
                ? pending.existingMembers.join(", ")
                : "No members yet"}
            </dd>
          </div>
        </dl>

        <p className="text-sm">
          Continuing adds <span className="font-medium">{pending.memberName}</span> to{" "}
          {who}&rsquo;s existing account. No invite link is created — they will see{" "}
          {pending.memberName} in the portal alongside{" "}
          {pending.existingMembers.length > 0 ? "their other members" : "nothing else"}, and
          they will be notified.
        </p>

        <p className="text-sm text-muted-foreground">
          If you did not mean this account, go back and correct the caregiver email — adding a
          member to the wrong account would show that family someone else&rsquo;s health record.
        </p>

        <form action={formAction}>
          {Object.entries(pending.fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <input type="hidden" name="link_existing" value="true" />

          <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
            <Button type="button" variant="outline" onClick={onCancel}>
              Go back and edit
            </Button>
            <SubmitButton pendingText="Adding…">Add to {who}&rsquo;s account</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
