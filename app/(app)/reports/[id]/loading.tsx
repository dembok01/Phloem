import { CardSkeleton, HeaderSkeleton } from "@/components/ui/skeleton";

export default function ReportLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex justify-end">
        <div className="h-10 w-36 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="space-y-4 rounded-xl bg-card p-6 shadow-card ring-1 ring-foreground/10 sm:p-10">
        <HeaderSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
