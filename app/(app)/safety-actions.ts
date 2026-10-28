"use server";

// Emergency & Safety (0059). Thin shells over the RPCs, which decide who may do what
// (the coordinator or the family saves the record; the assigned trainer reports; the
// assigned doctor clears). Error copy is the registry's (lib/rpc-errors).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { actionOk, actionFail, actionFromError, type ActionResult } from "@/lib/action-result";
import { safetyInputSchema, type SafetyInput, type SkipReason } from "@/lib/safety";

const memberId = z.string().uuid();
const FALLBACK = "Could not save that. Please try again.";

function revalidateMember(id: string) {
  revalidatePath(`/clinician/clients/${id}`);
  revalidatePath("/clinician/clients");
  revalidatePath(`/coordinator/members/${id}`);
  revalidatePath("/coordinator");
  revalidatePath("/portal");
}

export async function saveMemberSafetyAction(id: string, input: SafetyInput): Promise<ActionResult> {
  const m = memberId.safeParse(id);
  const parsed = safetyInputSchema.safeParse(input);
  if (!m.success || !parsed.success) return actionFail("Fill in every detail — only the private ambulance can be left blank.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_member_safety", { p_member: m.data, p_fields: parsed.data });
  if (error) {
    return actionFromError(error, FALLBACK, { not_allowed: "You can't change this client's emergency details." });
  }
  revalidateMember(m.data);
  return actionOk(undefined);
}

export async function requestSafetyDetailsAction(id: string): Promise<ActionResult> {
  const m = memberId.safeParse(id);
  if (!m.success) return actionFail("Invalid request.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_safety_details", { p_member: m.data });
  if (error) return actionFromError(error, FALLBACK);
  revalidateMember(m.data);
  return actionOk(undefined);
}

const eventSchema = z.object({
  member_id: z.string().uuid(),
  kind: z.enum(["skipped", "incident"]),
  reasons: z.array(z.enum(["chest_pain", "dizziness", "breathlessness", "high_bp", "other"])).max(5),
  detail: z.string().max(2000),
});

export async function reportSafetyEventAction(input: {
  member_id: string;
  kind: "skipped" | "incident";
  reasons: SkipReason[];
  detail: string;
}): Promise<ActionResult<{ eventId: string }>> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return actionFail("Invalid request.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_safety_event", {
    p_member: parsed.data.member_id,
    p_kind: parsed.data.kind,
    p_reasons: parsed.data.reasons,
    p_detail: parsed.data.detail,
  });
  if (error || !data) {
    return actionFromError(error ?? { message: "" }, FALLBACK, {
      not_allowed: "Only the client's trainer or coordinator can report this.",
    });
  }
  revalidateMember(parsed.data.member_id);
  return actionOk({ eventId: data });
}

const clearSchema = z.object({ member_id: z.string().uuid(), note: z.string().max(2000) });

export async function clearSafetyHoldAction(input: {
  member_id: string;
  note: string;
}): Promise<ActionResult<{ cleared: number }>> {
  const parsed = clearSchema.safeParse(input);
  if (!parsed.success) return actionFail("Invalid request.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clear_safety_hold", {
    p_member: parsed.data.member_id,
    p_note: parsed.data.note,
  });
  if (error) {
    return actionFromError(error, FALLBACK, {
      not_allowed: "Only the client's doctor can clear sessions to restart.",
    });
  }
  revalidateMember(parsed.data.member_id);
  return actionOk({ cleared: data ?? 0 });
}
