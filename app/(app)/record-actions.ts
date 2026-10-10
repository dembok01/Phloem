"use server";

// Correcting a record after enrolment (design §5). Every one of these is a thin
// shell over an 0035 RPC: the role-by-role field whitelist lives in SQL, and
// these only refuse obviously malformed input so a typo cannot spend a round
// trip. Shared by the admin desk, the family portal and /account.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { actionOk, actionFail, actionFromError, type ActionResult } from "@/lib/action-result";

/** A patch is a flat map of field key → string; SQL does the casting. */
const patchSchema = z.record(z.string().regex(/^[a-z_]{1,40}$/), z.string().max(500));
const memberPatchSchema = z.object({
  memberId: z.string().uuid(),
  patch: patchSchema,
});

const EDIT_FALLBACK = "Could not save those changes. Please try again.";

export async function updateMemberAction(
  memberId: string,
  patch: Record<string, string>,
): Promise<ActionResult> {
  const parsed = memberPatchSchema.safeParse({ memberId, patch });
  if (!parsed.success) return actionFail("Invalid request.");
  if (Object.keys(parsed.data.patch).length === 0) return actionFail("Nothing changed.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member", {
    p_member: parsed.data.memberId,
    p_patch: parsed.data.patch,
  });
  if (error) return actionFromError(error, EDIT_FALLBACK);

  revalidatePath("/portal");
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  return actionOk(undefined);
}

export async function updateMemberContactsAction(
  memberId: string,
  patch: Record<string, string>,
): Promise<ActionResult> {
  const parsed = memberPatchSchema.safeParse({ memberId, patch });
  if (!parsed.success) return actionFail("Invalid request.");
  if (Object.keys(parsed.data.patch).length === 0) return actionFail("Nothing changed.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member_contacts", {
    p_member: parsed.data.memberId,
    p_patch: parsed.data.patch,
  });
  if (error) return actionFromError(error, EDIT_FALLBACK);

  revalidatePath("/portal");
  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  return actionOk(undefined);
}

export async function updateMyProfileAction(
  patch: Record<string, string>,
): Promise<ActionResult> {
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return actionFail("Invalid request.");
  if (Object.keys(parsed.data).length === 0) return actionFail("Nothing changed.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_profile", { p_patch: parsed.data });
  if (error) return actionFromError(error, EDIT_FALLBACK);

  revalidatePath("/account");
  return actionOk(undefined);
}

export async function adminUpdateProfileAction(
  userId: string,
  patch: Record<string, string>,
): Promise<ActionResult> {
  const parsed = z.object({ userId: z.string().uuid(), patch: patchSchema })
    .safeParse({ userId, patch });
  if (!parsed.success) return actionFail("Invalid request.");
  if (Object.keys(parsed.data.patch).length === 0) return actionFail("Nothing changed.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_profile", {
    p_user: parsed.data.userId,
    p_patch: parsed.data.patch,
  });
  if (error) return actionFromError(error, EDIT_FALLBACK);

  revalidatePath("/admin/care-team");
  return actionOk(undefined);
}
