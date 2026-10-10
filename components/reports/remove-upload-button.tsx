"use client";

// Take back an uploaded report (0055) — wrong file, or wrong member. Two clicks on
// purpose: the report and its file are deleted for everyone who could open it.
// The RPC decides who may (admin, or whoever uploaded it); this only asks first.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { removeUploadedReport } from "@/app/(app)/reports/upload-actions";

export function RemoveUploadButton({ memberId, reportId }: { memberId: string; reportId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    setBusy(true);
    const res = await removeUploadedReport({ member_id: memberId, report_id: reportId });
    setBusy(false);
    if (!res.ok) {
      toast("error", res.error);
      return;
    }
    setConfirming(false);
    toast("success", "Upload removed — the report is back to how it was before");
    router.refresh();
  }

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setConfirming(true)}>
        Remove
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label="Confirm removal">
      <span className="text-xs text-muted-foreground">Delete it for everyone?</span>
      <Button type="button" variant="destructive" size="sm" onClick={remove} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : null} Yes, remove
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
        Keep it
      </Button>
    </span>
  );
}
