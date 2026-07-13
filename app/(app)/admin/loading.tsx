import { HeaderSkeleton, RowSkeleton, TileSkeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <section className="space-y-6">
      <HeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <TileSkeleton key={i} />
        ))}
      </div>
      <div className="space-y-3">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    </section>
  );
}
