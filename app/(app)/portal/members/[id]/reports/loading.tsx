// Mirrors the reports list: header with crumbs, then icon + two-line rows.
import { HeaderSkeleton, RowSkeleton } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <HeaderSkeleton crumbs />
      <div className="space-y-2">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    </div>
  );
}
