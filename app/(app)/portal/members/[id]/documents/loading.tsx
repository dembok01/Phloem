// Mirrors the documents page: header with crumbs, the dashed upload panel, then
// the "Uploaded documents" heading and its rows.
import { HeaderSkeleton, RowSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function DocumentsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <HeaderSkeleton crumbs />
      <div className="space-y-3 rounded-xl border border-dashed border-input bg-muted/30 p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-44" />
        <div className="space-y-2">
          <RowSkeleton />
          <RowSkeleton />
        </div>
      </div>
    </div>
  );
}
