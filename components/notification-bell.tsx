"use client";

// §12 global notification bell — unread count + dropdown, mark-read, deep-links.
// Reads the caller's own rows via the browser client (notif_own RLS); appears in
// every shell (rendered in the app header).
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Loader2 } from "lucide-react";
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
  const [pending, startTransition] = React.useTransition();
  const [navId, setNavId] = React.useState<string | null>(null);

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
    if (n.link) {
      setNavId(n.id);
      startTransition(() => router.push(n.link!));
    } else {
      setOpen(false);
    }
  }

  // Close the dropdown once the deep-link navigation commits.
  React.useEffect(() => {
    if (!pending && navId) {
      setNavId(null);
      setOpen(false);
    }
  }, [pending, navId]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        className="relative inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-5" />
        {unread > 0 ? (
          <span className="absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-data text-[10px] font-medium leading-none text-white ring-2 ring-card">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-30" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border bg-popover shadow-pop">
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
                      disabled={pending}
                      aria-busy={pending && navId === n.id}
                      className="flex w-full gap-2 px-3 py-2.5 text-left hover:bg-muted disabled:opacity-60"
                    >
                      <span aria-hidden className="mt-1.5 shrink-0">
                        {pending && navId === n.id ? (
                          <Loader2 className="size-3.5 animate-spin text-primary" />
                        ) : (
                          <span
                            className={`block size-2 rounded-full ${n.read_at ? "bg-transparent" : "bg-primary"}`}
                          />
                        )}
                      </span>
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
