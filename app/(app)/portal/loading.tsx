import { HeaderSkeleton, RowSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function PortalLoading() {
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <HeaderSkeleton />
      {/* Member story card: ring + status lines */}
      <div className="flex items-center gap-5 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <Skeleton className="size-24 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <div className="space-y-3">
        <RowSkeleton />
        <RowSkeleton />
      </div>
    </section>
  );
}
