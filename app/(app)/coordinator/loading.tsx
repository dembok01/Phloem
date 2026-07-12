import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function CoordinatorLoading() {
  return (
    <section className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <CardSkeleton />
      <CardSkeleton />
    </section>
  );
}
