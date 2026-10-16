"use client";

// The doctor's unfinished follow-up report (lib/follow-up-draft), offered back to
// them wherever they look for it. Discarding takes two clicks: what they wrote is
// gone for good, and nobody else ever saw it.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileClock, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { discardFollowUpDraft } from "@/app/(app)/clinician/clients/[id]/actions";

export function FollowUpDraftNotice({
  memberId,
  responseId,
  started,
}: {
  memberId: string;
  responseId: string;
  /** "Sat, 19 Sept" */
  started: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function discard() {
    setBusy(true);
    const res = await discardFollowUpDraft({ member_id: memberId, response_id: responseId });
    setBusy(false);
    if (!res.ok) {
      toast("error", res.error);
      return;
    }
    toast("success", "Draft discarded");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/45 bg-warning-tint p-4">
      <FileClock className="size-5 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1 basis-56 text-sm">
        <span className="font-medium">You have an unfinished follow-up report</span>, started {started}. It is saved,
        but no one sees it until you submit it.
      </p>
      {confirming ? (
        <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label="Confirm discarding the draft">
          <span className="text-xs text-muted-foreground">Delete what you wrote?</span>
          <Button type="button" variant="destructive" size="sm" onClick={discard} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null} Yes, discard
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
            Keep it
          </Button>
        </span>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-2">
          <Link
            href={`/clinician/clients/${memberId}?tab=form&followup=1`}
            className={cn(buttonVariants({ size: "sm" }), "no-underline")}
          >
            Continue it
          </Link>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            Discard
          </Button>
        </span>
      )}
    </div>
  );
}
