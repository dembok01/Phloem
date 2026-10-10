"use client";

// Shared by the care-team table and the family login on a member's page. A plain
// Sheet rather than EditRecordSheet: this writes through a different path, and it
// has to say out loud that no verification email is sent.
import * as React from "react";
import { useRouter } from "next/navigation";
import { AtSign } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { adminChangeEmailAction } from "@/app/(app)/admin/email-actions";

export function ChangeSignInEmail({
  userId,
  name,
  current,
}: {
  userId: string;
  name: string;
  current: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const formId = React.useId();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = String(new FormData(event.currentTarget).get("email") ?? "");
    start(async () => {
      const result = await adminChangeEmailAction(userId, next);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      toast("success", `Sign-in address changed for ${name}`);
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <AtSign className="size-3.5" aria-hidden /> Email
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Change ${name}'s sign-in address`}
        description={`${current ? `They sign in with ${current} today. ` : ""}The new address works immediately — no verification email is sent, because this is for someone who cannot reach their inbox.`}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              {pending ? "Changing…" : "Change address"}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-email`}>New sign-in address</Label>
            <Input id={`${formId}-email`} name="email" type="email" required autoComplete="off" className="h-11" />
          </div>
        </form>
      </Sheet>
    </>
  );
}
