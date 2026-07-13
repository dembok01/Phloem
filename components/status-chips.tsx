import { CalendarClock, Check, CircleDashed, FileClock, FileCheck2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeIST } from "@/lib/datetime";

// §10 dual-status chip, redesigned (C3): meeting and report state as one
// two-segment pill — shape + icon + tint, never color alone, readable in half
// a second. Vocabulary is fixed app-wide: To schedule → Scheduled → Done;
// Pending → Submitted.

const SEG = "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium whitespace-nowrap";

export function ConsultStatusChips({
  meeting,
  report,
  scheduledAt,
  className,
}: {
  meeting: string;
  report: string;
  scheduledAt?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-stretch divide-x divide-border overflow-hidden rounded-full border bg-card",
        className,
      )}
    >
      <MeetingSegment status={meeting} scheduledAt={scheduledAt} />
      <ReportSegment status={report} meetingDone={meeting === "done"} />
    </span>
  );
}

function MeetingSegment({ status, scheduledAt }: { status: string; scheduledAt?: string | null }) {
  if (status === "done") {
    return (
      <span className={cn(SEG, "bg-success-tint text-success")}>
        <Check className="size-3.5" aria-hidden /> Meeting done
      </span>
    );
  }
  if (status === "scheduled") {
    return (
      <span className={cn(SEG, "bg-info-tint text-info")}>
        <CalendarClock className="size-3.5" aria-hidden />
        {scheduledAt ? formatDateTimeIST(scheduledAt) : "Scheduled"}
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className={cn(SEG, "bg-muted text-muted-foreground")}>
        <X className="size-3.5" aria-hidden /> Cancelled
      </span>
    );
  }
  return (
    <span className={cn(SEG, "bg-muted text-muted-foreground")}>
      <CircleDashed className="size-3.5" aria-hidden /> To schedule
    </span>
  );
}

function ReportSegment({ status, meetingDone }: { status: string; meetingDone: boolean }) {
  if (status === "submitted") {
    return (
      <span className={cn(SEG, "bg-success-tint text-success")}>
        <FileCheck2 className="size-3.5" aria-hidden /> Report in
      </span>
    );
  }
  // Pending is only "hot" once the meeting has happened.
  return (
    <span className={cn(SEG, meetingDone ? "bg-warning-tint text-warning" : "bg-muted text-muted-foreground")}>
      <FileClock className="size-3.5" aria-hidden /> Report pending
    </span>
  );
}
