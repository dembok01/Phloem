import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { formatDateTimeIST } from "@/lib/datetime";
import { markAllRead, markOneRead } from "./actions";

// §12 notification page: full list with mark-read; every row deep-links.
export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: notifs } = await supabase
    .from("notifications")
    .select("id, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const list = notifs ?? [];
  const unread = list.filter((n) => !n.read_at).length;

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : "You're all caught up."}
        actions={
          unread > 0 ? (
            <form action={markAllRead}>
              <SubmitButton variant="outline" size="sm" pendingText="Marking…">
                Mark all as read
              </SubmitButton>
            </form>
          ) : null
        }
      />

      {list.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nothing here yet"
          description="Updates about consultations, reports, and your program will arrive here as they happen."
        />
      ) : (
        <ul className="space-y-2">
          {list.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 rounded-lg border p-3 ${n.read_at ? "bg-card" : "border-primary/30 bg-primary/5"}`}
            >
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-primary"}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                {n.link ? (
                  <Link href={n.link} className="font-medium hover:underline">
                    {n.title}
                  </Link>
                ) : (
                  <span className="font-medium">{n.title}</span>
                )}
                {n.body ? <p className="text-sm text-muted-foreground">{n.body}</p> : null}
                <p className="text-xs text-muted-foreground">{formatDateTimeIST(n.created_at)}</p>
              </div>
              {!n.read_at ? (
                <form action={markOneRead}>
                  <input type="hidden" name="id" value={n.id} />
                  <SubmitButton variant="ghost" size="xs" pendingText="…">
                    Mark read
                  </SubmitButton>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
