"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { datetimeLocalToIST } from "@/lib/datetime";

const assignSchema = z.object({
  member_id: z.string().uuid(),
  role: z.enum(["doctor", "nutritionist", "trainer", "psychologist"]),
  user_id: z.string().uuid(),
});

const scheduleSchema = z.object({
  member_id: z.string().uuid(),
  consultation_id: z.string().uuid(),
  at: z.string().min(1),
  mode: z.enum(["video", "phone", "in_person"]),
  link: z.string().trim().max(500).optional(),
});

const doneSchema = z.object({
  member_id: z.string().uuid(),
  consultation_id: z.string().uuid(),
});

// Success codes are verb-specific so the toast repeats the button's verb (C1).
function backTo(memberId: string, error?: string, ok?: string): never {
  const q = error ? `?error=${error}` : ok ? `?ok=${ok}` : "";
  redirect(`/coordinator/members/${memberId}${q}`);
}

/** §6 assign_care_team — creates/replaces the active assignment and the initial
 * consultation row for that role; notifies the professional. */
export async function assignCareTeam(formData: FormData): Promise<void> {
  const parsed = assignSchema.safeParse({
    member_id: formData.get("member_id"),
    role: formData.get("role"),
    user_id: formData.get("user_id"),
  });
  if (!parsed.success) backTo(String(formData.get("member_id") ?? ""), "invalid");

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_care_team", {
    p_member: parsed.data.member_id,
    p_role: parsed.data.role,
    p_user: parsed.data.user_id,
  });
  if (error) backTo(parsed.data.member_id, "assign_failed");
  revalidatePath(`/coordinator/members/${parsed.data.member_id}`);
  backTo(parsed.data.member_id, undefined, "assigned");
}

/** §6 set_consultation_schedule — sets time/mode/link, meeting → scheduled;
 * notifies professional + caregiver. */
export async function scheduleConsultation(formData: FormData): Promise<void> {
  const parsed = scheduleSchema.safeParse({
    member_id: formData.get("member_id"),
    consultation_id: formData.get("consultation_id"),
    at: formData.get("at"),
    mode: formData.get("mode"),
    link: formData.get("link") || undefined,
  });
  if (!parsed.success) backTo(String(formData.get("member_id") ?? ""), "invalid");

  const at = datetimeLocalToIST(parsed.data.at);
  if (!at) backTo(parsed.data.member_id, "bad_time");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_consultation_schedule", {
    p_cons: parsed.data.consultation_id,
    p_at: at,
    p_mode: parsed.data.mode,
    p_link: parsed.data.link,
  });
  if (error) backTo(parsed.data.member_id, "schedule_failed");
  revalidatePath(`/coordinator/members/${parsed.data.member_id}`);
  backTo(parsed.data.member_id, undefined, "scheduled");
}

/** §6 mark_meeting_done — scheduled → done; notifies professional to submit form. */
export async function markMeetingDone(formData: FormData): Promise<void> {
  const parsed = doneSchema.safeParse({
    member_id: formData.get("member_id"),
    consultation_id: formData.get("consultation_id"),
  });
  if (!parsed.success) backTo(String(formData.get("member_id") ?? ""), "invalid");

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_meeting_done", {
    p_cons: parsed.data.consultation_id,
  });
  if (error) backTo(parsed.data.member_id, "done_failed");
  revalidatePath(`/coordinator/members/${parsed.data.member_id}`);
  backTo(parsed.data.member_id, undefined, "meeting_done");
}

const closeSchema = z.object({
  member_id: z.string().uuid(),
  consultation_id: z.string().uuid(),
  reason: z.enum(["received_outside", "not_needed"]),
  note: z.string().trim().max(200).optional(),
});

/** 0048 close_report — the manual override for "Chase the report": the report came
 * in outside the dashboard (e.g. WhatsApp) or is not needed. The RPC re-checks the
 * role and that the report is actually being chased; notifies the clinician. */
export async function closeReport(formData: FormData): Promise<void> {
  const parsed = closeSchema.safeParse({
    member_id: formData.get("member_id"),
    consultation_id: formData.get("consultation_id"),
    reason: formData.get("reason"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) backTo(String(formData.get("member_id") ?? ""), "invalid");

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_report", {
    p_cons: parsed.data.consultation_id,
    p_reason: parsed.data.reason,
    p_note: parsed.data.note,
  });
  if (error) backTo(parsed.data.member_id, "close_failed");
  revalidatePath(`/coordinator/members/${parsed.data.member_id}`);
  revalidatePath("/coordinator");
  backTo(parsed.data.member_id, undefined, "report_closed");
}
