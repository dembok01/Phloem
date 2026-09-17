"use server";

// Moving someone's sign-in address for them (design §8.2) — for a family that has
// lost access to its inbox, or a professional whose address changed.
//
// Order is deliberate: GoTrue first, the audited RPC second. auth.users.email is
// the credential and profiles.email only a display mirror, so a failure between
// the two leaves a cosmetic mismatch (which /account self-heals) — never a person
// who cannot sign in. email_confirm: true skips verification on purpose: the
// whole point is that this person cannot read the inbox a link would go to.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionFail, actionFromError, actionOk, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  userId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(255),
});

export async function adminChangeEmailAction(userId: string, email: string): Promise<ActionResult> {
  const parsed = schema.safeParse({ userId, email });
  if (!parsed.success) return actionFail("Enter a valid email address.");

  // Checked here so a non-admin never reaches the service-role client at all.
  // admin_set_profile_email re-checks it, and that is the boundary that counts.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionFail("You are signed out.");
  const { data: me } = await supabase.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin" || me.status !== "active") {
    return actionFail("You don't have permission to do that.");
  }

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(parsed.data.userId, {
    email: parsed.data.email,
    email_confirm: true,
  });
  if (authError) {
    return actionFail(
      /already|registered|exists/i.test(authError.message)
        ? "Another account already uses that address."
        : "Could not change the sign-in address. Please try again.",
    );
  }

  const { error } = await supabase.rpc("admin_set_profile_email", {
    p_user: parsed.data.userId,
    p_email: parsed.data.email,
  });
  if (error) {
    return actionFromError(
      error,
      "The sign-in address changed, but the profile record did not update. It corrects itself the next time they open their account page.",
    );
  }

  revalidatePath("/admin/care-team");
  revalidatePath("/admin/members", "layout");
  return actionOk(undefined);
}
