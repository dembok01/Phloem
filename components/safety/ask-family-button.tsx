"use client";

// The coordinator asks the family to fill the details in on their dashboard
// (0059 request_safety_details: records when, and notifies the caregiver in-app).
// Few families open the dashboard unprompted, so the ask goes out on WhatsApp too:
// one tap records it and opens a chat with the message written.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { requestSafetyDetailsAction } from "@/app/(app)/safety-actions";

export function AskFamilyButton({
  memberId,
  message,
  waLink,
  asked,
}: {
  memberId: string;
  /** askFamilyText(…), with the dashboard link */
  message: string;
  /** wa.me link to the caregiver, or null when there is no number to message */
  waLink: string | null;
  asked: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = React.useTransition();

  function record(after?: string) {
    start(async () => {
      const res = await requestSafetyDetailsAction(memberId);
      if (!res.ok) {
        toast("error", res.error);
        return;
      }
      router.refresh();
      toast("success", after ?? "Asked — the family gets a notification in their dashboard.");
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      record("Copied — send it to the family. They also get a notification in their dashboard.");
    } catch {
      toast("error", "Couldn't copy the message. Try again.");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {waLink ? (
        // A real link, so WhatsApp opens on the tap itself; the request is
        // recorded alongside.
        <a
          href={`${waLink}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => record("Asked — WhatsApp is open with the message. They also get a notification in their dashboard.")}
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "no-underline")}
        >
          <MessageCircle className="size-3.5" aria-hidden /> {asked ? "Remind on WhatsApp" : "Ask on WhatsApp"}
        </a>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => record()} loading={pending}>
          {asked ? "Ask again in the dashboard" : "Ask in the dashboard"}
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={copy} disabled={pending}>
        <Copy className="size-3.5" aria-hidden /> Copy message
      </Button>
    </span>
  );
}
