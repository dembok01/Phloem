"use server";

// Uploading a report as a file (0054/0055) — shared by the coordinator's member page
// and the nutritionist's client page. Three steps, so a 15 MB scan never passes
// through a server action (Vercel caps a request body at 4.5 MB):
//   1. startReportUpload — a signed upload URL for one new path in the private
//      `reports` bucket, issued only to someone who may upload for that report;
//   2. the browser uploads straight to it;
//   3. finishReportUpload — upload_report / upload_diet_review attach the file and
//      re-check everything; if they refuse, the orphaned file is deleted.
// The RPCs are the boundary; the checks here only keep strangers from getting URLs.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { actionFail, actionFromError, actionOk, type ActionResult } from "@/lib/action-result";
import { RPC_ERROR_COPY } from "@/lib/rpc-errors";

const EXT = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" } as const;
const mime = z.enum(["application/pdf", "image/jpeg", "image/png"]);
const size = z.number().int().positive().max(15 * 1024 * 1024);
// A report slot (a consultation), or a diet review for a cycle.
const target = z.object({ kind: z.enum(["slot", "review"]), id: z.string().uuid() });

const startSchema = z.object({ member_id: z.string().uuid(), target, mime, size });

export async function startReportUpload(
  input: z.infer<typeof startSchema>,
): Promise<ActionResult<{ path: string; token: string }>> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return actionFail("Upload a PDF, JPG or PNG file of 15 MB or less.");
  const { member_id, target: t } = parsed.data;

  const me = await getSessionProfile();
  const staff = me?.role === "coordinator" || me?.role === "admin";
  if (!me || (!staff && me.role !== "nutritionist")) {
    return actionFail(RPC_ERROR_COPY.not_allowed, "not_allowed");
  }
  // RLS does the narrowing: a nutritionist reads only their own type of consultation,
  // and list_member_cycles returns only the cycles of members assigned to them.
  const supabase = await createClient();
  if (t.kind === "slot") {
    const { data: cons } = await supabase
      .from("consultations")
      .select("member_id, type")
      .eq("id", t.id)
      .maybeSingle();
    if (!cons || cons.member_id !== member_id) return actionFail(RPC_ERROR_COPY.not_found, "not_found");
    if (cons.type === "doctor") return actionFail(RPC_ERROR_COPY.doctor_upload_refused, "doctor_upload_refused");
    if (!staff && cons.type !== "nutritionist") return actionFail(RPC_ERROR_COPY.not_allowed, "not_allowed");
  } else {
    // 0056: the cycles a viewer may see for this member (clinicians can't read packages).
    const { data: cycles } = await supabase.rpc("list_member_cycles", { p_member: member_id });
    if (!cycles?.some((c) => c.id === t.id)) return actionFail(RPC_ERROR_COPY.not_found, "not_found");
  }

  const path = `${member_id}/uploads/${crypto.randomUUID()}.${EXT[parsed.data.mime]}`;
  const { data, error } = await createAdminClient().storage.from("reports").createSignedUploadUrl(path);
  if (error || !data) return actionFail("Could not start the upload. Please try again.");
  return actionOk({ path: data.path, token: data.token });
}

const finishSchema = z.object({
  member_id: z.string().uuid(),
  target,
  path: z.string().max(300),
  file_name: z.string().trim().min(1).max(200),
  mime,
  size,
  note: z.string().trim().max(200).optional(),
  /** yyyy-mm-dd, the diet review meeting — reviews only */
  review_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function finishReportUpload(
  input: z.infer<typeof finishSchema>,
): Promise<ActionResult<{ reportId: string }>> {
  const parsed = finishSchema.safeParse(input);
  if (!parsed.success) return actionFail("Please check the form and try again.");
  const d = parsed.data;
  if (d.target.kind === "review" && !d.review_date) return actionFail("Choose the date of the review meeting.");

  const supabase = await createClient();
  const { data, error } =
    d.target.kind === "slot"
      ? await supabase.rpc("upload_report", {
          p_cons: d.target.id,
          p_path: d.path,
          p_file_name: d.file_name,
          p_mime: d.mime,
          p_size: d.size,
          p_note: d.note || undefined,
        })
      : await supabase.rpc("upload_diet_review", {
          p_member: d.member_id,
          p_cycle: d.target.id,
          p_review_date: d.review_date!,
          p_path: d.path,
          p_file_name: d.file_name,
          p_mime: d.mime,
          p_size: d.size,
          p_note: d.note || undefined,
        });
  if (error || !data) {
    // Don't leave the file behind — but only a file in this member's upload folder
    // that no report uses, so a bad request can never delete someone's report.
    const admin = createAdminClient();
    if (new RegExp(`^${d.member_id}/uploads/[0-9a-f-]{36}\\.(pdf|jpg|png)$`).test(d.path)) {
      const { data: used } = await admin.from("reports").select("id").eq("pdf_path", d.path).limit(1);
      if (!used?.length) await admin.storage.from("reports").remove([d.path]);
    }
    return actionFromError(error ?? { message: "" }, "Could not attach the report. Please try again.");
  }
  revalidateMember(d.member_id);
  return actionOk({ reportId: data });
}

const removeSchema = z.object({ member_id: z.string().uuid(), report_id: z.string().uuid() });

/** Take an upload back (wrong file or wrong member). The RPC allows admin, or whoever
 * uploaded it, and returns the files to delete — every version it replaced too. */
export async function removeUploadedReport(input: z.infer<typeof removeSchema>): Promise<ActionResult> {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return actionFail("Please try again.");
  const supabase = await createClient();
  const { data: paths, error } = await supabase.rpc("remove_uploaded_report", {
    p_report: parsed.data.report_id,
  });
  if (error) return actionFromError(error, "Could not remove the upload. Please try again.");
  if (paths?.length) await createAdminClient().storage.from("reports").remove(paths);
  revalidateMember(parsed.data.member_id);
  return actionOk(undefined);
}

function revalidateMember(memberId: string) {
  revalidatePath(`/coordinator/members/${memberId}`);
  revalidatePath(`/clinician/clients/${memberId}`);
  revalidatePath("/coordinator");
}
