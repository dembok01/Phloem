import { HeaderSkeleton, RowSkeleton } from "@/components/ui/skeleton";

export default function NotificationsLoading() {
  return (
    <section className="space-y-6">
      <HeaderSkeleton />
      <div className="space-y-2">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    </section>
  );
}
