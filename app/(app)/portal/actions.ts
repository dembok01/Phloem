"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { actionOk, actionFail, actionFromError, type ActionResult } from "@/lib/action-result";

// P-4 — a caregiver sets the "Larger text & simpler view" preference on their
// parent's OWN login, persisted server-side so it holds across the elderly
// person's devices. Goes through the audited §6 set_member_elderly_mode RPC
// (caregivers have no UPDATE on profiles). Returns a result the client toasts.
const schema = z.object({ memberId: z.string().uuid(), enabled: z.boolean() });

export async function setMemberElderlyModeAction(
  memberId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const parsed = schema.safeParse({ memberId, enabled });
  if (!parsed.success) return actionFail("invalid");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_elderly_mode", {
    p_member: parsed.data.memberId,
    p_enabled: parsed.data.enabled,
  });
  if (error) return actionFromError(error, "Could not update the setting. Please try again.");

  revalidatePath("/portal");
  return actionOk(undefined);
}

// P-3 — point the member row at an uploaded photo (or clear it). The bytes are
// uploaded to the private `member-photos` bucket by the client under its own
// storage RLS; this only sets the pointer, through the audited set_member_photo
// RPC (caregivers have no UPDATE on members).
const photoSchema = z.object({
  memberId: z.string().uuid(),
  path: z.string().max(400).nullable(),
});

export async function setMemberPhotoAction(
  memberId: string,
  path: string | null,
): Promise<ActionResult> {
  const parsed = photoSchema.safeParse({ memberId, path });
  if (!parsed.success) return actionFail("invalid");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_photo", {
    p_member: parsed.data.memberId,
    p_path: parsed.data.path as string, // RPC accepts NULL to clear
  });
  if (error) return actionFromError(error, "Could not update the photo. Please try again.");

  revalidatePath("/portal");
  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  return actionOk(undefined);
}
