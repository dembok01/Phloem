"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

const uuid = z.string().uuid();

const submitSchema = z.object({
  member_id: z.string().uuid(),
  response_id: z.string().uuid(),
  answers: z.record(z.string(), z.unknown()),
});

/** §6 mark_video_watched — RLS/ownership enforced inside the RPC (is_caregiver_of). */
export async function markVideoWatched(memberId: string): Promise<void> {
  const parsed = uuid.safeParse(memberId);
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_video_watched", { p_member: parsed.data });
  if (error) return; // fail-closed in the DB; nothing actionable to surface here
  revalidatePath(`/portal/onboarding/${parsed.data}`);
}

const RPC_MESSAGES: Record<string, string> = {
  video_not_watched: "Please watch the welcome video first.",
  invalid_response: "We couldn't find your saved answers. Please refresh and try again.",
  not_allowed: "You don't have permission to submit this onboarding.",
};

function friendly(message: string): string {
  for (const [key, text] of Object.entries(RPC_MESSAGES)) {
    if (message.includes(key)) return text;
  }
  return "Something went wrong submitting onboarding. Your answers are saved — please try again.";
}

/**
 * Persist the caregiver's final answers to their draft (RLS-owned) and run §6
 * `submit_onboarding`: it applies the §4 data-split (contacts → member_contacts,
 * stripped from answers), the §13 red-flag engine, builds the onboarding summary
 * report, advances the member to `onboarded`, and notifies coordinator + admin.
 * Returns `{ ok }` (client navigates to the portal) or `{ error }`.
 */
export async function submitOnboarding(input: {
  member_id: string;
  response_id: string;
  answers: Record<string, unknown>;
}): Promise<{ ok: true } | { error: string }> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid onboarding data." };
  const { member_id, response_id, answers } = parsed.data;

  const supabase = await createClient();

  // Authoritative save of the latest answers (guards against an in-flight
  // autosave debounce). Ownership is enforced by the caregiver RLS policy.
  const { error: saveErr } = await supabase
    .from("form_responses")
    .update({ answers: answers as unknown as Json })
    .eq("id", response_id)
    .eq("member_id", member_id);
  if (saveErr) return { error: "Could not save your answers. Please try again." };

  const { error: rpcErr } = await supabase.rpc("submit_onboarding", {
    p_member: member_id,
    p_response: response_id,
  });
  if (rpcErr) return { error: friendly(rpcErr.message) };

  revalidatePath("/portal");
  revalidatePath(`/portal/onboarding/${member_id}`);
  return { ok: true };
}
