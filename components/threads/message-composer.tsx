"use client";

// W2 — the reply box. Deliberately plain: a textarea, a send button, and nothing
// else. Care conversations are short and consequential; a formatting toolbar would
// invite length where brevity is kinder to a clinician reading twenty of these.
//
// Enter sends, Shift+Enter makes a new line — the convention people already have
// from every messaging app, so nobody has to be taught it.
import * as React from "react";
import { useRouter } from "next/navigation";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { postMessage } from "@/app/(app)/thread-actions";

export function MessageComposer({
  threadId,
  memberId,
  placeholder = "Write a reply…",
  disabled = false,
  disabledReason,
}: {
  threadId: string;
  memberId: string;
  placeholder?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [body, setBody] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function send() {
    const text = body.trim();
    if (!text || pending) return;
    startTransition(async () => {
      const res = await postMessage({ thread_id: threadId, member_id: memberId, body: text });
      if (res.ok) {
        setBody("");
        toast("success", "Message sent");
        router.refresh();
      } else {
        toast("error", res.error);
      }
    });
  }

  if (disabled) {
    return (
      <p className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {disabledReason ?? "This conversation is closed."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor={`composer-${threadId}`} className="sr-only">
        Write a reply
      </label>
      <textarea
        id={`composer-${threadId}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        rows={3}
        placeholder={placeholder}
        disabled={pending}
        className="w-full rounded-lg border bg-card px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Enter sends · Shift + Enter for a new line
        </p>
        <Button size="sm" loading={pending} disabled={pending || body.trim() === ""} onClick={send}>
          <SendHorizontal className="size-3.5" aria-hidden /> Send
        </Button>
      </div>
    </div>
  );
}
