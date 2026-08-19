// Mirrors the messages page: header with crumbs, then conversation cards.
import { CardSkeleton, HeaderSkeleton } from "@/components/ui/skeleton";

export default function MessagesLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <HeaderSkeleton crumbs />
      <CardSkeleton />
    </div>
  );
}
