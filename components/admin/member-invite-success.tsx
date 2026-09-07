"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Share2 } from "lucide-react";
import { CopyField } from "@/components/copy-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CreatedMemberInvite } from "@/lib/member-enrollment";
import { cn } from "@/lib/utils";

export function MemberInviteSuccess({
  invite,
  onEnrollAnother,
}: {
  invite: CreatedMemberInvite;
  onEnrollAnother: () => void;
}) {
  const [canShare, setCanShare] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    setCanShare(typeof navigator.share === "function");
  }, []);

  async function shareInvite() {
    setShareError(null);

    try {
      await navigator.share({
        title: "PHLOEM caregiver invite",
        text: `Use this secure link to complete onboarding for ${invite.memberName}.`,
        url: invite.inviteUrl,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareError("Could not open sharing. You can copy the link instead.");
    }
  }

  return (
    <Card className="border-emerald-600/30">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-emerald-600/10 p-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 aria-hidden className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle>Member enrolled</CardTitle>
            <p className="text-sm text-muted-foreground">
              The caregiver invite for {invite.memberName} is ready. No email was sent automatically.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Member
            </dt>
            <dd className="mt-1 font-medium">{invite.memberName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Caregiver email
            </dt>
            <dd className="mt-1 break-all font-medium">{invite.caregiverEmail}</dd>
          </div>
        </dl>

        <div className="space-y-2">
          <p className="text-sm font-medium">Invite link</p>
          <p className="text-sm text-muted-foreground">
            Copy and send this secure link to the caregiver. It can also be copied later from Invites.
          </p>
          <CopyField value={invite.inviteUrl} label={`Invite link for ${invite.memberName}`} />
        </div>

        {canShare ? (
          <Button type="button" variant="outline" onClick={shareInvite}>
            <Share2 aria-hidden />
            Share invite
          </Button>
        ) : null}
        {shareError ? (
          <p role="status" className="text-sm text-destructive">
            {shareError}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
          <Link href="/admin/invites" className={cn(buttonVariants({ variant: "outline" }))}>
            View invites
          </Link>
          <Button type="button" onClick={onEnrollAnother}>
            Enroll another member
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
