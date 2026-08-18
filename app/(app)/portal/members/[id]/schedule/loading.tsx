// Mirrors the schedule: header with crumbs, then the "Upcoming" eyebrow above
// consultation rows.
import { HeaderSkeleton, RowSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function ScheduleLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <HeaderSkeleton crumbs />
      <div className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <div className="space-y-2">
          <RowSkeleton />
          <RowSkeleton />
        </div>
      </div>
    </div>
  );
}
