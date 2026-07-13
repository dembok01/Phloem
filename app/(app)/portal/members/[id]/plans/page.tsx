import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReportView } from "@/components/reports/ReportView";
import { REPORT_CSS } from "@/lib/reports/styles";
import { parseReportContent } from "@/lib/reports/types";
import { PrintButton } from "@/components/portal/print-button";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ClipboardList } from "lucide-react";
import { formatDateIST } from "@/lib/datetime";

// Browser-print rules for this page: only the plan documents print, one per
// sheet — the app shell header is already print-hidden from the layout.
const PRINT_CSS = `
@media print {
  .print-hidden { display: none !important; }
  .plan-sheet { break-after: page; box-shadow: none !important; border: 0 !important; padding: 0 !important; }
  .plan-sheet:last-child { break-after: auto; }
}
`;

// §10 caregiver/elderly "Plans" — nutrition & training plans front and centre,
// printable. RLS (rep_cg / rep_member) is the access boundary.
export default async function PortalPlansPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase.from("members").select("id, full_name").eq("id", id).maybeSingle();
  if (!member) notFound();

  const { data: reports } = await supabase
    .from("reports")
    .select("id, type, content, created_at")
    .eq("member_id", id)
    .in("type", ["nutrition_plan", "nutrition_review", "training_plan", "training_review"])
    .order("created_at", { ascending: false });

  const latest = (prefix: string) => (reports ?? []).find((r) => r.type.startsWith(prefix));
  const nutrition = latest("nutrition");
  const training = latest("training");
  const plans = [
    nutrition ? { ...nutrition, anchor: "nutrition", label: "Nutrition plan" } : null,
    training ? { ...training, anchor: "training", label: "Training plan" } : null,
  ].filter(Boolean) as ((NonNullable<typeof nutrition>) & { anchor: string; label: string })[];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <style dangerouslySetInnerHTML={{ __html: REPORT_CSS + PRINT_CSS }} />
      <div className="print-hidden">
        <PageHeader
          title="Plans"
          description={`The latest guidance from ${member.full_name.split(" ")[0]}'s care team — follow these day to day.`}
          crumbs={[{ label: "Portal", href: "/portal" }, { label: "Plans" }]}
          actions={plans.length > 0 ? <PrintButton label="Print plans" /> : null}
        />
      </div>

      {plans.length > 1 ? (
        <nav aria-label="Jump to plan" className="print-hidden flex gap-2">
          {plans.map((p) => (
            <a
              key={p.anchor}
              href={`#${p.anchor}`}
              className="inline-flex min-h-9 items-center rounded-full border bg-card px-4 text-sm font-medium hover:bg-muted"
            >
              {p.label}
            </a>
          ))}
        </nav>
      ) : null}

      {plans.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Plans arrive after the first consultations"
          description="Once the nutritionist and trainer meet the family, their plans appear here — written for everyday use at home."
        />
      ) : (
        plans.map((r) => (
          <section key={r.id} id={r.anchor} className="scroll-mt-20">
            <p className="print-hidden mb-2 flex items-baseline justify-between gap-2">
              <span className="eyebrow">{r.label}</span>
              <span className="font-data text-xs text-muted-foreground">Updated {formatDateIST(r.created_at)}</span>
            </p>
            <div className="plan-sheet rounded-xl bg-card p-6 shadow-card ring-1 ring-foreground/10 sm:p-8">
              <ReportView content={parseReportContent(r.content)} />
            </div>
          </section>
        ))
      )}
    </div>
  );
}
