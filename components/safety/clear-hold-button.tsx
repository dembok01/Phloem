"use client";

// The doctor clears sessions to restart (0059 clear_safety_hold). Two steps on
// purpose — a note on why, then a confirm — because it lets training resume.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { clearSafetyHoldAction } from "@/app/(app)/safety-actions";

export function ClearHoldButton({ memberId }: { memberId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [pending, start] = React.useTransition();
  const id = React.useId();

  function clear() {
    start(async () => {
      const res = await clearSafetyHoldAction({ member_id: memberId, note });
      if (!res.ok) {
        toast("error", res.error);
        return;
      }
      setOpen(false);
      setNote("");
      router.refresh();
      toast("success", "Sessions can restart — the trainer and coordinator have been told.");
    });
  }

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Clear to restart
      </Button>
    );
  }
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Why can sessions restart?</Label>
      <textarea
        id={id}
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label="Confirm clearing">
        <Button type="button" size="sm" onClick={clear} loading={pending} disabled={note.trim() === ""}>
          Yes, clear to restart
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Not yet
        </Button>
      </span>
    </div>
  );
}
