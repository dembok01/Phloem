import { HeaderSkeleton, RowSkeleton } from "@/components/ui/skeleton";

export default function ClientsLoading() {
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <HeaderSkeleton />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}
