"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { actionFail, actionFromError, actionOk, type ActionResult } from "@/lib/action-result";

const revokeSchema = z.object({ id: z.string().uuid() });

/** Revoke = delete an unclaimed invite (used invites are immutable history). */
export async function revokeInvite(formData: FormData): Promise<void> {
  const parsed = revokeSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/admin/invites?error=invalid");

  const supabase = await createClient();
  const { error } = await supabase
    .from("invites")
    .delete()
    .eq("id", parsed.data.id)
    .is("used_at", null);
  if (error) redirect("/admin/invites?error=revoke_failed");

  revalidatePath("/admin/invites");
  redirect("/admin/invites?revoked=1");
}

/**
 * Result-returning twin of revokeInvite, for the table's single-click row action.
 *
 * Deliberately offers no Undo: revoking DELETES the row (used invites are
 * immutable history, so an unclaimed one is simply removed). There is nothing to
 * restore, and a token that has been shown on screen should not come back.
 */
export async function revokeInviteAction(id: string): Promise<ActionResult> {
  const parsed = revokeSchema.safeParse({ id });
  if (!parsed.success) return actionFail("Invalid request.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("invites")
    .delete()
    .eq("id", parsed.data.id)
    .is("used_at", null);
  if (error) {
    return actionFromError(error, "Could not revoke that invite. It may already be used.");
  }

  revalidatePath("/admin/invites");
  return actionOk(undefined);
}
