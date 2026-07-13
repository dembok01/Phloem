import { HeaderSkeleton, RowSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function CoordinatorLoading() {
  return (
    <section className="space-y-6">
      <HeaderSkeleton />
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
