"use client";

// Inline scheduling from the Today queue (Workspace Elevation E4). Previously the
// only affordance on a "Schedule the … consultation" row was Open, which meant
// leaving the queue, acting on the member page, and coming back — for every one
// of them. This does it in place.
//
// The form posts to the SAME `scheduleConsultation` server action the member page
// uses, so the §6 RPC stays the single enforcement path; nothing new is trusted.
import * as React from "react";
import { CalendarPlus } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { scheduleConsultation } from "@/app/(app)/coordinator/members/[id]/actions";

export function ScheduleSheet({
  memberId,
  memberName,
  consultationId,
  role,
}: {
  memberId: string;
  memberName: string;
  consultationId: string;
  role: string;
}) {
  const [open, setOpen] = React.useState(false);
  const formId = `sched-${consultationId}`;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <CalendarPlus className="size-3.5" aria-hidden /> Schedule
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Schedule the ${role} consultation`}
        description={`${memberName} — the professional and the family are both notified.`}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form={formId} pendingText="Scheduling…">
              Schedule
            </SubmitButton>
          </>
        }
      >
        <form id={formId} action={scheduleConsultation} className="space-y-5">
          <input type="hidden" name="member_id" value={memberId} />
          <input type="hidden" name="consultation_id" value={consultationId} />
          <div className="flex items-center gap-3 rounded-2xl border border-role-coordinator/15 bg-role-coordinator/5 p-4">
            <span className="icon-well bg-role-coordinator/10 text-role-coordinator"><CalendarPlus className="size-5" aria-hidden /></span>
            <div><p className="font-medium">{memberName}</p><p className="text-sm capitalize text-muted-foreground">{role} consultation</p></div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-at`}>Date and time (IST)</Label>
            {/* Native datetime-local: the action already parses this exact format. */}
            <Input id={`${formId}-at`} name="at" type="datetime-local" required className="h-11" />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-mode`}>Mode</Label>
            <select
              id={`${formId}-mode`}
              name="mode"
              required
              defaultValue="video"
              className="h-11 w-full rounded-xl border border-input bg-card px-3 text-base outline-none transition-[border-color,box-shadow] duration-160 hover:border-primary/35 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
            >
              <option value="video">Video call</option>
              <option value="phone">Phone call</option>
              <option value="in_person">In person</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-link`}>
              Meeting link <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input id={`${formId}-link`} name="link" type="url" className="h-11" />
          </div>
        </form>
      </Sheet>
    </>
  );
}
