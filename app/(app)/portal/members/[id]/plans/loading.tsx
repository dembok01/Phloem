// Without this, the /portal loading.tsx above serves the whole subtree and a
// family tapping "Plans" sees a member story card with a round photo placeholder
// that then swaps for a document — a skeleton actively lying about what is
// coming. This mirrors the plan sheets instead.
import { HeaderSkeleton, SheetSkeleton } from "@/components/ui/skeleton";

export default function PlansLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <HeaderSkeleton crumbs />
      <SheetSkeleton />
    </div>
  );
}
