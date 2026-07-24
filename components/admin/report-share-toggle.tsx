"use client";

// P-1 — "Shared with family" switch for a doctor/performance report row on the
// admin member page. Submits the §6 set_report_sharing action; the switch shows
// the *current* state and posts the flipped value. Pending state comes from the
// parent form via useFormStatus so the control disables mid-round-trip.
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { setReportSharing } from "@/app/(app)/admin/members/[id]/actions";

export function ReportShareToggle({
  reportId,
  memberId,
  shared,
}: {
  reportId: string;
  memberId: string;
  shared: boolean;
}) {
  return (
    <form action={setReportSharing} className="flex items-center gap-2">
      <input type="hidden" name="report_id" value={reportId} />
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="shared" value={shared ? "false" : "true"} />
      <Switch shared={shared} />
    </form>
  );
}

function Switch({ shared }: { shared: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={shared}
      disabled={pending}
      aria-label={shared ? "Shared with family — turn off" : "Not shared — share with family"}
      className={cn(
        "inline-flex items-center gap-2 rounded-full text-xs font-medium transition-opacity disabled:opacity-60",
      )}
    >
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          shared ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "inline-block size-4 rounded-full bg-card shadow transition-transform",
            shared ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
      <span className={cn(shared ? "text-foreground" : "text-muted-foreground")}>
        {shared ? "Shared with family" : "Share with family"}
      </span>
    </button>
  );
}
