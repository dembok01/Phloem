"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDateTimeIST } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { markOneRead } from "./actions";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * The full list. Two things make a read land the moment it happens rather than
 * on the next server round trip:
 *  - "Mark read" is optimistic: the dot shrinks away and the tint fades at once;
 *    if the write fails, the server's answer puts them back.
 *  - A card with a link is the link, whole, and opening it marks it read — the
 *    way the bell already behaves. Mark read sits above the link (z-10).
 */
export function NotificationList({ items }: { items: NotificationItem[] }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [readNow, markLocally] = React.useOptimistic(
    new Set<string>(),
    (state: Set<string>, id: string) => new Set(state).add(id),
  );
  // Opening a card navigates away, so there is nothing to roll back; this only
  // keeps a ctrl/⌘-click (new tab) from leaving the card looking unread here.
  const [opened, setOpened] = React.useState<Set<string>>(() => new Set());

  function open(n: NotificationItem) {
    if (n.read_at || opened.has(n.id)) return;
    setOpened((s) => new Set(s).add(n.id));
    // Browser client, like the bell: an RLS-scoped (notif_own) write that doesn't
    // queue behind the navigation the way a server action would.
    void supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", n.id)
      .is("read_at", null);
  }

  return (
    <ul className="space-y-2">
      {items.map((n) => {
        const read = !!n.read_at || readNow.has(n.id) || opened.has(n.id);
        return (
          <li
            key={n.id}
            className={cn(
              "relative flex items-start gap-3 rounded-lg border p-3 transition-colors duration-(--motion-pop) ease-out",
              read ? "bg-card" : "border-primary/30 bg-primary/5",
              n.link && "hover:border-input",
            )}
          >
            <span
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full bg-primary transition-[scale,opacity] duration-(--motion-pop) ease-out",
                read && "scale-0 opacity-0",
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              {n.link ? (
                <Link
                  href={n.link}
                  onClick={() => open(n)}
                  className="font-medium text-foreground outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] hover:underline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
                >
                  {n.title}
                  {read ? null : <span className="sr-only"> (unread)</span>}
                </Link>
              ) : (
                <span className="font-medium">{n.title}</span>
              )}
              {n.body ? <p className="text-sm text-muted-foreground">{n.body}</p> : null}
              <p className="text-xs text-muted-foreground">{formatDateTimeIST(n.created_at)}</p>
            </div>
            {read ? null : (
              <form
                className="relative z-10"
                action={async (formData) => {
                  markLocally(n.id);
                  await markOneRead(formData);
                }}
              >
                <input type="hidden" name="id" value={n.id} />
                <SubmitButton variant="ghost" size="sm" pendingText="…">
                  Mark read
                </SubmitButton>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
