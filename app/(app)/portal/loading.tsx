import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function PortalLoading() {
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Skeleton className="h-9 w-1/2" />
      <CardSkeleton />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <CardSkeleton />
    </section>
  );
}
