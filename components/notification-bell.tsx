"use client";

// §12 global notification bell — unread count + dropdown, mark-read, deep-links.
// Reads the caller's own rows via the browser client (notif_own RLS); appears in
// every shell (rendered in the app header).
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTimeIST } from "@/lib/datetime";

type Notif = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell() {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const [items, setItems] = React.useState<Notif[]>([]);
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(15);
    setItems(data ?? []);
  }, [supabase]);

  React.useEffect(() => {
    load();
  }, [load]);

  const unread = items.filter((i) => !i.read_at).length;
  const now = () => new Date().toISOString();

  async function markRead(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read_at: i.read_at ?? now() } : i)));
    await supabase.from("notifications").update({ read_at: now() }).eq("id", id).is("read_at", null);
  }
  async function markAll() {
    setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? now() })));
    await supabase.from("notifications").update({ read_at: now() }).is("read_at", null);
  }
  async function openItem(n: Notif) {
    await markRead(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        className="relative inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted"
      >
        <Bell className="size-5" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-30" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border bg-popover shadow-lg">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-semibold">Notifications</span>
              {unread > 0 ? (
                <button type="button" onClick={markAll} className="text-xs text-primary hover:underline">
                  Mark all read
                </button>
              ) : null}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</li>
              ) : (
                items.map((n) => (
                  <li key={n.id} className="border-b last:border-0">
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className="flex w-full gap-2 px-3 py-2.5 text-left hover:bg-muted"
                    >
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-primary"}`}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{n.title}</span>
                        {n.body ? <span className="block truncate text-xs text-muted-foreground">{n.body}</span> : null}
                        <span className="block text-[11px] text-muted-foreground">{formatDateTimeIST(n.created_at)}</span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t px-3 py-2 text-center text-xs font-medium text-primary hover:bg-muted"
            >
              View all
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
