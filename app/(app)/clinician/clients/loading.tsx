import { HeaderSkeleton, RowSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function ClientsLoading() {
  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <HeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <Skeleton className="h-64 rounded-3xl" />
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}
