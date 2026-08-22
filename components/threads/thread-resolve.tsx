"use client";

// W2 — closing and reopening a conversation, plus marking it read.
//
// Marking read is a side effect of looking, so it fires on mount rather than
// asking for a click; the badge a coordinator relies on is only useful if it
// clears itself when they actually read the thread.
import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { markThreadRead, resolveThread } from "@/app/(app)/thread-actions";

export function ThreadResolveButton({
  threadId,
  memberId,
  resolved,
  hasUnread,
}: {
  threadId: string;
  memberId: string;
  resolved: boolean;
  hasUnread: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  const { toast } = useToast();

  // Seen it ⇒ read it. Fires once per mount, only when something is actually
  // unread, so it never writes on every render of every thread on the page.
  React.useEffect(() => {
    if (!hasUnread) return;
    void markThreadRead({ thread_id: threadId });
  }, [threadId, hasUnread]);

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await resolveThread({
            thread_id: threadId,
            member_id: memberId,
            resolved: !resolved,
          });
          if (res.ok) {
            toast("success", resolved ? "Conversation reopened" : "Conversation closed");
            router.refresh();
          } else {
            toast("error", res.error);
          }
        })
      }
    >
      {resolved ? (
        <>
          <Undo2 className="size-3.5" aria-hidden /> Reopen
        </>
      ) : (
        <>
          <CheckCheck className="size-3.5" aria-hidden /> Close conversation
        </>
      )}
    </Button>
  );
}
