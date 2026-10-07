import { cn } from "@/lib/utils";

// The tab rail's look, shared by NavTabs (a client component) and the clinician
// member page's own rail (a server component), so the two cannot drift. Kept out
// of nav-tabs.tsx because a "use client" module hands server code a reference,
// not a callable function.
//
// A recessed track with the current tab raised out of it — a segmented control,
// the shape people already read as "one of these is chosen, the others are a
// press away". The old white rail with a pale-green active pill left the other
// tabs as bare grey words.

export const TAB_TRACK =
  "bg-[color-mix(in_oklab,var(--muted),var(--foreground)_4%)] p-1 ring-1 ring-foreground/[0.06] ring-inset";

export function tabClass(active: boolean, className?: string): string {
  return cn(
    "rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-(--motion-press) ease-out",
    active
      ? "bg-card text-primary shadow-card ring-1 ring-foreground/[0.08]"
      : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
    className,
  );
}
