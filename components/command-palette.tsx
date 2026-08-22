"use client";

// ⌘K command palette (C3): jump to any member or desk surface from the keyboard.
// Members load once per open via the browser client — RLS scopes the rows to what
// the signed-in user may see, which is also why the same component serves the
// clinician desk: a doctor's search returns their caseload and nobody else's.
//
// It renders its own visible trigger. A keyboard-only feature with no affordance
// is a feature almost nobody finds — the shortcut stays, the pill just tells
// people it is there.
import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, KanbanSquare, Loader2, Search, UserRound, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: React.ReactNode;
};

// Where each desk's search lands. Kept inside the client component so a layout
// passes a plain string rather than a table of JSX across the boundary.
const DESKS = {
  coordinator: {
    memberBase: "/coordinator/members",
    pages: [
      { id: "page-today", label: "Today queue", href: "/coordinator", icon: <CalendarDays className="size-4" /> },
      { id: "page-pipeline", label: "Pipeline board", href: "/coordinator/pipeline", icon: <KanbanSquare className="size-4" /> },
    ] as Item[],
  },
  clinician: {
    memberBase: "/clinician/clients",
    pages: [
      { id: "page-clients", label: "My clients", href: "/clinician/clients", icon: <UsersRound className="size-4" /> },
    ] as Item[],
  },
};

export function CommandPalette({ desk = "coordinator" }: { desk?: keyof typeof DESKS }) {
  const { memberBase, pages } = DESKS[desk];
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const [members, setMembers] = React.useState<Item[]>([]);
  const [pending, startTransition] = React.useTransition();
  const [navHref, setNavHref] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  // Resolved after mount so the server render and the first client render agree.
  const [modKey, setModKey] = React.useState("Ctrl");
  React.useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setModKey("⌘");
  }, []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    inputRef.current?.focus();
    void (async () => {
      const { data } = await supabase
        .from("members")
        .select("id, full_name, status, city")
        .order("full_name");
      setMembers(
        (data ?? []).map((m) => ({
          id: m.id,
          label: m.full_name,
          hint: [m.status.replace(/_/g, " "), m.city].filter(Boolean).join(" · "),
          href: `${memberBase}/${m.id}`,
          icon: <UserRound className="size-4" />,
        })),
      );
    })();
  }, [open, supabase, memberBase]);

  const q = query.trim().toLowerCase();
  const results = [
    ...members.filter((m) => !q || m.label.toLowerCase().includes(q)),
    ...pages.filter((p) => !q || p.label.toLowerCase().includes(q)),
  ];

  // Keep the palette open with a spinner on the chosen row until the destination
  // route commits (startTransition stays pending through the RSC navigation), then
  // close — so a slow jump reads as "opening…", not a frozen click.
  function go(item: Item) {
    if (pending) return;
    setNavHref(item.href);
    startTransition(() => {
      router.push(item.href);
    });
  }

  React.useEffect(() => {
    if (!pending && navHref) {
      setNavHref(null);
      setOpen(false);
    }
  }, [pending, navHref]);

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && results[cursor]) {
      e.preventDefault();
      go(results[cursor]);
    }
  }

  React.useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable inline-flex h-9 items-center gap-2 rounded-full border bg-card pl-3 pr-1.5 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Search className="size-4" aria-hidden />
        <span>Search</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-data text-[11px]">{modKey}K</kbd>
      </button>

      {!open ? null : (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 p-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border bg-popover shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Jump to a member or page…"
            aria-label="Search members and pages"
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border bg-muted px-1.5 font-data text-[11px] text-muted-foreground">esc</kbd>
        </div>
        <ul ref={listRef} className="max-h-72 overflow-y-auto p-1.5" role="listbox">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches for &ldquo;{query}&rdquo;.
            </li>
          ) : (
            results.map((item, i) => (
              <li key={item.id} role="option" aria-selected={i === cursor} data-index={i}>
                <button
                  type="button"
                  onClick={() => go(item)}
                  onMouseEnter={() => setCursor(i)}
                  disabled={pending}
                  aria-busy={pending && navHref === item.href}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm disabled:opacity-60",
                    i === cursor ? "bg-secondary text-secondary-foreground" : "text-foreground",
                  )}
                >
                  <span className="text-muted-foreground">
                    {pending && navHref === item.href ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      item.icon
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                  {pending && navHref === item.href ? (
                    <span className="truncate text-xs text-muted-foreground">Opening…</span>
                  ) : item.hint ? (
                    <span className="truncate text-xs capitalize text-muted-foreground">{item.hint}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="border-t px-4 py-2 font-data text-[11px] text-muted-foreground">
          ↑↓ to choose · Enter to open · esc to close
        </p>
      </div>
    </div>
      )}
    </>
  );
}
