import { Skeleton } from "@/components/ui/skeleton";

export default function ClientsLoading() {
  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <Skeleton className="h-8 w-40" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </section>
  );
}
