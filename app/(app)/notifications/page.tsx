import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { markAllRead } from "./actions";
import { NotificationList } from "./notification-list";

// §12 notification page: full list with mark-read; every card with a link opens it.
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
        <NotificationList items={list} />
      )}
    </section>
  );
}
