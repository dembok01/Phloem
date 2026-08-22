"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import { buildClinicalReport } from "@/lib/reports/build/clinical";
import { type RpcErrorCode } from "@/lib/rpc-errors";
import { actionOk, actionFail, actionFromError, type ActionResult } from "@/lib/action-result";

type CareRole = Database["public"]["Enums"]["care_role"];
type ReportType = Database["public"]["Enums"]["report_type"];

const submitSchema = z.object({
  member_id: z.string().uuid(),
  consultation_id: z.string().uuid(),
  answers: z.record(z.string(), z.unknown()),
});

function reportTypeFor(role: CareRole, isInitial: boolean): ReportType {
  switch (role) {
    case "doctor":
      return isInitial ? "doctor_initial" : "doctor_review";
    case "nutritionist":
      return isInitial ? "nutrition_plan" : "nutrition_review";
    case "trainer":
      return isInitial ? "training_plan" : "training_review";
    case "psychologist":
      return "wellbeing";
  }
}

const RPC_MESSAGES: Partial<Record<RpcErrorCode, string>> = {
  awaiting_doctor_clearance:
    "The doctor has not cleared this member for exercise yet — the form stays locked until then.",
  meeting_not_done: "This meeting hasn't been marked done by the coordinator yet.",
  not_allowed: "You are not assigned to this member for this consultation.",
  template_missing: "The form template is missing.",
};

const feedbackSchema = z.object({ response_id: z.string().uuid() });

/**
 * Submit a monthly feedback draft via §6 `submit_feedback` (the RPC re-validates
 * that the caller owns the draft and is the assigned nutritionist/trainer, and
 * compiles the performance report once both feedbacks are in).
 */
export async function submitFeedback(input: { response_id: string }): Promise<ActionResult> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) return actionFail("Invalid feedback.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_feedback", { p_response: parsed.data.response_id });
  if (error) {
    return actionFromError(error, "Could not submit your feedback. Please try again.", {
      not_allowed: "You can only submit your own feedback for a member you're assigned to.",
    });
  }
  return actionOk(undefined);
}

/**
 * Build the §8 report content for this consultation's type/round and submit it via
 * §6 `submit_clinical_form` (the RPC stays the sole atomic writer, re-validates
 * assignment + meeting-done, and enforces the trainer clearance gate). Returns the
 * new report id (client navigates to it) or a friendly error.
 */
export async function submitClinicalForm(input: {
  member_id: string;
  consultation_id: string;
  answers: Record<string, unknown>;
}): Promise<ActionResult<{ reportId: string }>> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return actionFail("Invalid form data.");
  const { member_id, consultation_id, answers } = parsed.data;

  const supabase = await createClient();

  // Derive report type from the consultation (RLS: cons_clinician lets the
  // assigned clinician read their own-type consultation).
  const { data: cons } = await supabase
    .from("consultations")
    .select("type, cycle_id")
    .eq("id", consultation_id)
    .maybeSingle();
  if (!cons) return actionFail("Consultation not found.");

  const { data: member } = await supabase
    .from("members")
    .select("full_name")
    .eq("id", member_id)
    .maybeSingle();

  let cycleNumber: number | null = null;
  if (cons.cycle_id) {
    const { data: cyc } = await supabase.from("cycles").select("number").eq("id", cons.cycle_id).maybeSingle();
    cycleNumber = cyc?.number ?? null;
  }

  const reportType = reportTypeFor(cons.type as CareRole, cons.cycle_id === null);
  const content = buildClinicalReport(reportType, {
    memberName: member?.full_name ?? "Member",
    answers,
    cycle: cycleNumber,
  });

  const { data: reportId, error: rpcErr } = await supabase.rpc("submit_clinical_form", {
    p_cons: consultation_id,
    p_answers: answers as unknown as Json,
    p_report_content: content as unknown as Json,
  });
  if (rpcErr) return actionFromError(rpcErr, "Could not submit the form. Please try again.", RPC_MESSAGES);

  revalidatePath(`/clinician/clients/${member_id}`);
  return actionOk({ reportId: reportId as string });
}

// ============ W1.4 — cases ============
// A case is a clinical problem tracked across cycles. Authoring is mostly
// automatic (submit_clinical_form seeds cases from the doctor's problem list and
// appends to open ones at each review), so these actions cover the deliberate
// edits: opening one by hand, recording a note, closing it, and deciding whether
// the family sees it. Every write goes through a §6-style RPC that re-checks the
// caller is an admin or the assigned doctor.

const openCaseSchema = z.object({
  member_id: z.string().uuid(),
  title: z.string().trim().min(1, "Give the case a title.").max(160),
  detail: z.string().trim().max(2000).optional(),
  severity: z.enum(["low", "medium", "high"]),
});

export async function openCase(input: {
  member_id: string;
  title: string;
  detail?: string;
  severity: string;
}): Promise<ActionResult<string>> {
  const parsed = openCaseSchema.safeParse(input);
  if (!parsed.success) {
    return actionFail(parsed.error.issues[0]?.message ?? "Check the case details.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_case", {
    p_member: parsed.data.member_id,
    p_title: parsed.data.title,
    p_detail: parsed.data.detail ?? undefined,
    p_severity: parsed.data.severity,
  });
  if (error) {
    return actionFromError(error, "Could not open the case.", {
      not_allowed: "Only the assigned doctor can open a case for this member.",
    });
  }
  revalidatePath(`/clinician/clients/${parsed.data.member_id}`);
  return actionOk(data as unknown as string);
}

const caseNoteSchema = z.object({
  case_id: z.string().uuid(),
  member_id: z.string().uuid(),
  summary: z.string().trim().min(1, "Write a note before saving.").max(2000),
});

export async function addCaseNote(input: {
  case_id: string;
  member_id: string;
  summary: string;
}): Promise<ActionResult> {
  const parsed = caseNoteSchema.safeParse(input);
  if (!parsed.success) {
    return actionFail(parsed.error.issues[0]?.message ?? "Write a note before saving.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_case_note", {
    p_case: parsed.data.case_id,
    p_summary: parsed.data.summary,
  });
  if (error) return actionFromError(error, "Could not save the note.");
  revalidatePath(`/clinician/clients/${parsed.data.member_id}`);
  return actionOk(undefined);
}

const caseStatusSchema = z.object({
  case_id: z.string().uuid(),
  member_id: z.string().uuid(),
  status: z.enum(["open", "monitoring", "resolved"]),
  note: z.string().trim().max(2000).optional(),
});

export async function setCaseStatus(input: {
  case_id: string;
  member_id: string;
  status: string;
  note?: string;
}): Promise<ActionResult> {
  const parsed = caseStatusSchema.safeParse(input);
  if (!parsed.success) return actionFail("Pick a valid status.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_case_status", {
    p_case: parsed.data.case_id,
    p_status: parsed.data.status,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) return actionFromError(error, "Could not update the case.");
  revalidatePath(`/clinician/clients/${parsed.data.member_id}`);
  return actionOk(undefined);
}

const caseSharingSchema = z.object({
  case_id: z.string().uuid(),
  member_id: z.string().uuid(),
  shared: z.boolean(),
});

export async function setCaseSharing(input: {
  case_id: string;
  member_id: string;
  shared: boolean;
}): Promise<ActionResult> {
  const parsed = caseSharingSchema.safeParse(input);
  if (!parsed.success) return actionFail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_case_sharing", {
    p_case: parsed.data.case_id,
    p_shared: parsed.data.shared,
  });
  if (error) return actionFromError(error, "Could not change who can see this case.");
  revalidatePath(`/clinician/clients/${parsed.data.member_id}`);
  revalidatePath(`/portal/members/${parsed.data.member_id}`);
  return actionOk(undefined);
}

// ============ W1.6 — compile a progress summary on demand ============
// The cron generates one automatically at every cycle close. This is the doctor's
// "I want it now" path — before a consultation, or after correcting a form.
//
// Two clients on purpose: the ADMIN client reads the source data (the builder
// narrows to family-safe measures explicitly, in one file you can audit), while the
// USER's client performs the RPC so the database authorises the real caller and
// stamps created_by. A doctor who is not assigned to this member is refused by the
// RPC, not by this action.
const compileSchema = z.object({
  member_id: z.string().uuid(),
  cycle_id: z.string().uuid().nullable().optional(),
  force: z.boolean().optional(),
});

export async function compileProgressSummary(input: {
  member_id: string;
  cycle_id?: string | null;
  force?: boolean;
}): Promise<ActionResult<string>> {
  const parsed = compileSchema.safeParse(input);
  if (!parsed.success) return actionFail("Invalid request.");

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { generateProgressSummary } = await import("@/lib/reports/progress");
  const supabase = await createClient();

  const result = await generateProgressSummary(createAdminClient(), supabase, {
    memberId: parsed.data.member_id,
    cycleId: parsed.data.cycle_id ?? null,
    force: parsed.data.force ?? false,
  });
  if ("error" in result) {
    return actionFail(
      result.error.includes("not_allowed")
        ? "Only the assigned doctor or an admin can compile this summary."
        : "Could not compile the progress summary. Please try again.",
    );
  }
  revalidatePath(`/clinician/clients/${parsed.data.member_id}`);
  return actionOk(result.reportId);
}
