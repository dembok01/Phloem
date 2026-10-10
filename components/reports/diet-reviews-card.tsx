// Diet reviews (0055) — the nutritionist meets the member every two weeks, so a
// cycle carries two reviews, each a typed form or an uploaded file. Shown to the
// coordinator (who sees when each review happened but opens only what they
// uploaded — §3 "status only") and to the assigned nutritionist (who can open all).
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { UploadReportSheet } from "@/components/coordinator/upload-report-sheet";
import { RemoveUploadButton } from "@/components/reports/remove-upload-button";
import { formatDateIST } from "@/lib/datetime";
import { reviewTargets, type ReviewCycle } from "@/lib/report-uploads";

export type DietReview = {
  report_id: string;
  cycle_id: string;
  review_date: string;
  source: string;
  uploaded_by: string;
  uploader_name: string;
  file_name: string | null;
};

export function DietReviewsCard({
  memberId,
  memberName,
  cycles,
  reviews,
  viewer,
}: {
  memberId: string;
  memberName: string;
  cycles: ReviewCycle[];
  reviews: DietReview[];
  viewer: { id: string; role: string };
}) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const perCycle = new Map<string, number>();
  for (const r of reviews) perCycle.set(r.cycle_id, (perCycle.get(r.cycle_id) ?? 0) + 1);
  const targets = reviewTargets(cycles, perCycle, today);
  if (targets.length === 0) return null; // no cycle has begun: the plan comes first

  const isStaff = viewer.role === "admin" || viewer.role === "coordinator";
  // A coordinator opens only their own uploads; the nutritionist and admin read every review.
  const canOpen = (r: DietReview) => viewer.role !== "coordinator" || r.uploaded_by === viewer.id;
  const canRemove = (r: DietReview) =>
    r.source === "file" && (viewer.role === "admin" || r.uploaded_by === viewer.id);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>Diet reviews</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            One per review meeting — usually two a month. Upload the PDF or photo the nutritionist wrote.
          </p>
        </div>
        <UploadReportSheet
          memberId={memberId}
          memberName={memberName}
          targets={targets}
          preselect={targets[0].id}
          triggerLabel="Add a diet review"
          selfLine={isStaff ? "and so will you" : ""}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {targets.map((t) => {
          const list = reviews.filter((r) => r.cycle_id === t.id);
          return (
            <section key={t.id} aria-label={t.label}>
              <h3 className="eyebrow">Cycle {cycles.find((c) => c.id === t.id)?.number}</h3>
              {list.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">No diet reviews yet.</p>
              ) : (
                <ul className="mt-1 divide-y">
                  {list.map((r) => (
                    <li key={r.report_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span>
                        <span className="font-medium">{formatDateIST(r.review_date)}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {r.source === "file" ? "file" : "typed form"} ·{" "}
                          {r.uploaded_by === viewer.id ? "you" : r.uploader_name}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        {canOpen(r) ? (
                          <a
                            href={r.source === "file" ? `/api/reports/${r.report_id}/pdf?view=1` : `/reports/${r.report_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            View
                          </a>
                        ) : null}
                        {canRemove(r) ? <RemoveUploadButton memberId={memberId} reportId={r.report_id} /> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
