import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { parseFormTemplate } from "@/components/forms/schema";
import type { FormValues } from "@/components/forms/types";
import { humanize } from "@/lib/reports/build/helpers";
import { formatDateTimeIST } from "@/lib/datetime";
import { AmendClinicalForm } from "./amend-clinical-form";

// 0045 — correcting a report this clinician already submitted. Reports are
// immutable (§8), so this does not edit the document: saving supersedes it with a
// new version, and the reader is sent to that new version.
//
// Every gate here is a cosmetic mirror of amend_clinical_report's own checks. The
// RPC is the boundary: it re-reads the report and refuses anyone who is not its
// author, no longer assigned, or aiming at a version that has already been replaced.
export default async function EditReportPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = await params;
  const supabase = await createClient();

  const session = await getSessionProfile();
  if (!session) notFound();

  // A borrowed admin desk is read-only — the same line submit_clinical_form and
  // submit_feedback hold. The RPC refuses an admin outright (they are never the
  // report's created_by), so this only spares them a dead-end page.
  if (session.role === "admin") notFound();

  // RLS (rep_*) already limits this to reports the caller may read.
  const { data: report } = await supabase
    .from("reports")
    .select("id, member_id, type, version, created_by, created_at, form_response_id")
    .eq("id", reportId)
    .eq("member_id", id)
    .maybeSingle();
  if (!report) notFound();
  if (report.created_by !== session.user.id) notFound();
  if (!report.form_response_id) notFound();

  // Already corrected once: that correction is the live document, so send the
  // clinician to it rather than letting them fork the history.
  const { data: newer } = await supabase
    .from("reports")
    .select("id")
    .eq("supersedes", report.id)
    .maybeSingle();
  if (newer) notFound();

  const [{ data: member }, { data: response }] = await Promise.all([
    supabase.from("members").select("full_name").eq("id", id).maybeSingle(),
    // fr_own_clinical: the respondent reads their own submission.
    supabase
      .from("form_responses")
      .select("id, answers, template_id")
      .eq("id", report.form_response_id)
      .maybeSingle(),
  ]);
  if (!member || !response) notFound();

  const { data: template } = await supabase
    .from("form_templates")
    .select("schema")
    .eq("id", response.template_id)
    .maybeSingle();
  if (!template) notFound();

  const schema = parseFormTemplate(template.schema);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        crumbs={[
          { label: "My members", href: "/clinician/clients" },
          { label: member.full_name, href: `/clinician/clients/${id}` },
          { label: "Correct report" },
        ]}
        title={`Correct the ${humanize(report.type).toLowerCase()}`}
        description={`Submitted ${formatDateTimeIST(report.created_at)}${
          report.version > 1 ? ` · version ${report.version}` : ""
        }. Saving issues a new version — the one you are correcting is kept, and the care team can still open it.`}
      />

      <AmendClinicalForm
        memberId={id}
        reportId={report.id}
        sections={schema.sections}
        answers={(response.answers ?? {}) as FormValues}
      />
    </section>
  );
}
