"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import { buildClinicalReport } from "@/lib/reports/build/clinical";

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

const RPC_MESSAGES: Record<string, string> = {
  awaiting_doctor_clearance:
    "The doctor has not cleared this member for exercise yet — the form stays locked until then.",
  meeting_not_done: "This meeting hasn't been marked done by the coordinator yet.",
  not_allowed: "You are not assigned to this member for this consultation.",
  template_missing: "The form template is missing.",
};
function friendly(message: string): string {
  for (const [key, text] of Object.entries(RPC_MESSAGES)) if (message.includes(key)) return text;
  return "Could not submit the form. Please try again.";
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
}): Promise<{ reportId: string } | { error: string }> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid form data." };
  const { member_id, consultation_id, answers } = parsed.data;

  const supabase = await createClient();

  // Derive report type from the consultation (RLS: cons_clinician lets the
  // assigned clinician read their own-type consultation).
  const { data: cons } = await supabase
    .from("consultations")
    .select("type, cycle_id")
    .eq("id", consultation_id)
    .maybeSingle();
  if (!cons) return { error: "Consultation not found." };

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
  if (rpcErr) return { error: friendly(rpcErr.message) };

  revalidatePath(`/clinician/clients/${member_id}`);
  return { reportId: reportId as string };
}
