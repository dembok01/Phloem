import { HeaderSkeleton, RowSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function CoordinatorLoading() {
  return (
    <section className="space-y-8">
      <HeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-64 rounded-3xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <Skeleton className="min-h-24 rounded-2xl" />
          <Skeleton className="min-h-24 rounded-2xl" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    </section>
  );
}
