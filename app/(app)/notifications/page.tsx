import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
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
    <section className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {unread > 0 ? (
          <form action={markAllRead}>
            <Button type="submit" variant="outline" size="sm">
              Mark all as read
            </Button>
          </form>
        ) : null}
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl bg-card p-10 text-center text-muted-foreground ring-1 ring-foreground/10">
          <Bell className="mx-auto mb-2 size-6" />
          <p>No notifications yet.</p>
        </div>
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
                  <Button type="submit" variant="ghost" size="xs">
                    Mark read
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
