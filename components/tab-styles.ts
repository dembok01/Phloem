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
  "rounded-2xl border border-border/80 bg-muted/65 p-1.5 shadow-[inset_0_1px_3px_rgb(31_42_36_/_0.03)]";

/** The raised face of the current tab. NavTabs paints it once, on a pill that
 * glides between tabs; the server-rendered rail paints it on the tab itself. */
export const TAB_FACE = "bg-card shadow-card ring-1 ring-foreground/[0.06]";

export function tabClass(active: boolean, className?: string, { face = true } = {}): string {
  return cn(
    "relative rounded-xl px-4 py-2 text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-(--motion-press) ease-out",
    active
      ? cn("text-primary", face && TAB_FACE)
      : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
    className,
  );
}
