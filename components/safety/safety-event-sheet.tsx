"use client";

// "No session today" (tells the coordinator) and "Report an incident" (tells the
// doctor and the coordinator, and holds sessions until the doctor clears them).
// The trainer's card and the coordinator's member page both use it.
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, CalendarX2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { SKIP_REASONS, type SkipReason } from "@/lib/safety";
import { reportSafetyEventAction } from "@/app/(app)/safety-actions";

const TEXTAREA =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none " +
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function SafetyEventSheet({
  memberId,
  kind,
  triggerLabel,
}: {
  memberId: string;
  kind: "skipped" | "incident";
  triggerLabel: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [reasons, setReasons] = React.useState<SkipReason[]>([]);
  const [detail, setDetail] = React.useState("");
  const [pending, start] = React.useTransition();
  const formId = React.useId();
  const incident = kind === "incident";
  const ready = incident ? detail.trim() !== "" : reasons.length > 0;

  function toggle(r: SkipReason) {
    setReasons((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    start(async () => {
      const res = await reportSafetyEventAction({ member_id: memberId, kind, reasons, detail });
      if (!res.ok) {
        toast("error", res.error);
        return;
      }
      setOpen(false);
      setReasons([]);
      setDetail("");
      router.refresh();
      toast(
        "success",
        incident
          ? "The doctor and coordinator have been told. Sessions are on hold until the doctor clears them."
          : "The coordinator has been told.",
      );
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={incident ? "destructive" : "outline"}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="min-h-11"
      >
        {incident ? <AlertOctagon aria-hidden /> : <CalendarX2 aria-hidden />} {triggerLabel}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={incident ? "Report an incident" : "No session today"}
        description={
          incident
            ? "The doctor and the coordinator are told straight away. Sessions stay on hold until the doctor clears them."
            : "Chest pain, dizziness, breathlessness or very high BP means no session today. The coordinator is told."
        }
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              variant={incident ? "destructive" : "default"}
              loading={pending}
              disabled={!ready}
            >
              {incident ? "Report it" : "Tell the coordinator"}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="space-y-4">
          {incident ? (
            <div className="space-y-2">
              <Label htmlFor={`${formId}-detail`}>What happened, and what did you do?</Label>
              <textarea
                id={`${formId}-detail`}
                required
                rows={5}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                className={TEXTAREA}
              />
            </div>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">Why not today?</legend>
                {SKIP_REASONS.map((r) => (
                  <label key={r.value} className="flex min-h-11 items-center gap-3 rounded-lg border px-3">
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={reasons.includes(r.value)}
                      onChange={() => toggle(r.value)}
                    />
                    {r.label}
                  </label>
                ))}
              </fieldset>
              <div className="space-y-2">
                <Label htmlFor={`${formId}-note`}>Anything else (optional)</Label>
                <textarea
                  id={`${formId}-note`}
                  rows={3}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  className={TEXTAREA}
                />
              </div>
            </>
          )}
        </form>
      </Sheet>
    </>
  );
}
