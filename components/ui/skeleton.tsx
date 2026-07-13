import { cn } from "@/lib/utils";

// §11 loading skeletons — pulse placeholders shaped like the layouts they
// stand in for (C1), so nothing jumps when data lands.
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

/** A list row: leading circle, two lines of text, trailing chip. */
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
    </div>
  );
}

/** A stat tile: label line over a large number. */
export function TileSkeleton() {
  return (
    <div className="space-y-2 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-8 w-14" />
    </div>
  );
}

/** Page header: title + description line. */
export function HeaderSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}
