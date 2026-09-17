"use server";

// Moving someone's sign-in address for them (design §8.2) — for a family that has
// lost access to its inbox, or a professional whose address changed.
//
// Order is deliberate: GoTrue first, the audited RPC second. auth.users.email is
// the credential, so a failure between the two can never lock anyone out. What it
// can do is leave profiles.email — where notification mail goes — on the old
// address until the person's next page view, when the app shell re-syncs it.
// email_confirm: true skips verification on purpose: the whole point is that this
// person cannot read the inbox a link would go to.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionFail, actionFromError, actionOk, type ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/observe";

const schema = z.object({
  userId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(255),
});

export async function adminChangeEmailAction(userId: string, email: string): Promise<ActionResult> {
  const parsed = schema.safeParse({ userId, email });
  if (!parsed.success) return actionFail("Enter a valid email address.");

  // THIS check is the boundary for the auth.users write below: the service-role
  // client bypasses RLS, so nothing in the database stops it. admin_set_profile_email
  // re-checks the role only for the profile copy and its audit row.
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
    // The credential already moved; without this there is no record of who moved it.
    logError("auth.admin_email_change.audit_failed", error.message, {
      actor: user.id,
      target: parsed.data.userId,
      to: parsed.data.email,
    });
    return actionFromError(
      error,
      "The sign-in address changed, but the profile record did not update. It corrects itself the next time they load the dashboard.",
    );
  }

  revalidatePath("/admin/care-team");
  revalidatePath("/admin/members", "layout");
  return actionOk(undefined);
}
