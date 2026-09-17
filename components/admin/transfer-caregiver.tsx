"use client";

// Two paths, one sheet: hand the member to a family login that already exists, or
// invite one that does not. The warning is not decoration — access moves the
// instant caregiver_id flips, because every gate reads is_caregiver_of().
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  inviteReplacementCaregiverAction,
  transferCaregiverAction,
} from "@/app/(app)/admin/members/[id]/actions";

export type CaregiverOption = { id: string; full_name: string; email: string };

const SELECT =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none " +
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function TransferCaregiver({
  memberId,
  memberName,
  currentName,
  options,
}: {
  memberId: string;
  memberName: string;
  currentName: string | null;
  options: CaregiverOption[];
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const formId = React.useId();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const existing = String(data.get("existing") ?? "");
    const email = String(data.get("email") ?? "").trim();
    if (!existing && !email) {
      toast("error", "Choose a family login, or enter an email to invite.");
      return;
    }
    if (existing && email) {
      toast("error", "Choose one: an existing family login, or an invite — not both.");
      return;
    }

    start(async () => {
      const result = existing
        ? await transferCaregiverAction(memberId, existing)
        : await inviteReplacementCaregiverAction(memberId, email);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      toast(
        "success",
        existing ? `${memberName} moved to the new family login` : "Invite created — copy its link from Invites",
      );
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Users className="size-3.5" aria-hidden /> Change
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Who manages ${memberName}'s care?`}
        description={
          currentName
            ? `${currentName} manages it today. Moving to an existing login takes effect immediately, and ${currentName} loses access to this record at that moment.`
            : "No family login is linked yet."
        }
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              {pending ? "Saving…" : "Confirm"}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-existing`}>Move to an existing family login</Label>
            <select id={`${formId}-existing`} name="existing" defaultValue="" className={SELECT}>
              <option value="">— none —</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name} · {o.email}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label htmlFor={`${formId}-email`}>Or invite someone new</Label>
            <Input id={`${formId}-email`} name="email" type="email" autoComplete="off" className="h-11" />
            <p className="text-xs text-muted-foreground">
              Nothing changes until they accept. Find the link to send them on{" "}
              <Link href="/admin/invites" className="underline underline-offset-4">
                Invites
              </Link>
              .
            </p>
          </div>
        </form>
      </Sheet>
    </>
  );
}
