"use server";

// Changing the address you sign in with (design §8.1).
//
// House pattern, not Supabase's built-in mail: like forgot-password, the tokens
// are minted with generateLink and delivered by OUR mailer, so links work on any
// device and nothing depends on Supabase's SMTP.
//
// The project runs secure email change (double_confirm_changes): BOTH addresses
// must confirm. Verified on throwaway accounts before this was written — the
// CURRENT address confirms through its link (token_hash), but the NEW address's
// token_hash never verifies; it confirms through its 6-digit code. Hence one link
// to the old inbox and one code to the new.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/notify";
import { logEvent, logError } from "@/lib/observe";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

const emailSchema = z.string().trim().toLowerCase().email().max(255);
const codeSchema = z.string().trim().regex(/^\d{6}$/);

export async function requestEmailChangeAction(newEmail: string): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(newEmail);
  if (!parsed.success) return actionFail("Enter a valid email address.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return actionFail("You are signed out. Please sign in again.");

  // Only ever the signed-in user's OWN address: the service-role client below
  // mints links, so the email it is given must come from the session, never input.
  const current = user.email.toLowerCase();
  const next = parsed.data;
  if (next === current) return actionFail("That is already your sign-in address.");

  const admin = createAdminClient();
  const cur = await admin.auth.admin.generateLink({ type: "email_change_current", email: current, newEmail: next });
  const nw = await admin.auth.admin.generateLink({ type: "email_change_new", email: current, newEmail: next });
  if (cur.error || nw.error || !cur.data.properties || !nw.data.properties) {
    logEvent("auth.email_change.no_link", {
      reason: cur.error?.message ?? nw.error?.message ?? "no_properties",
    });
    return actionFail("We couldn't start that change. The address may already be in use.");
  }

  const link = `${APP_URL}/auth/confirm?token_hash=${cur.data.properties.hashed_token}&type=email_change`;
  const [sentCurrent, sentNew] = await Promise.all([
    sendEmail(
      current,
      "Confirm your PHLOEM sign-in change",
      [
        `Someone asked to change the sign-in address for this PHLOEM account to ${next}.`,
        "",
        "If that was you, open this link to confirm from this inbox:",
        link,
        "",
        "You will also need the code we sent to the new address.",
        "If this wasn't you, ignore this email — nothing changes unless both are confirmed.",
      ].join("\n"),
    ),
    sendEmail(
      next,
      "Your PHLOEM confirmation code",
      [
        "Enter this code on your PHLOEM account page to confirm this address:",
        "",
        nw.data.properties.email_otp,
        "",
        "You will also need to open the link we sent to your current address.",
        "If you didn't ask for this, ignore this email.",
      ].join("\n"),
    ),
  ]);
  if (!sentCurrent || !sentNew) {
    logError("auth.email_change.email_failed", "a confirmation email was not accepted");
    return actionFail("We couldn't send the confirmation emails. Please try again.");
  }

  revalidatePath("/account");
  return actionOk(undefined);
}

/** `completed` is false when the code was accepted but the link to the current
 *  address has not been opened yet — the change waits for both. */
export async function confirmEmailCodeAction(
  code: string,
): Promise<ActionResult<{ completed: boolean }>> {
  const parsed = codeSchema.safeParse(code);
  if (!parsed.success) return actionFail("Enter the 6-digit code from your new inbox.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionFail("You are signed out. Please sign in again.");
  if (!user.new_email) return actionFail("There's no address change waiting to be confirmed.");

  const target = user.new_email;
  const { error } = await supabase.auth.verifyOtp({ type: "email_change", email: target, token: parsed.data });
  if (error) return actionFail("That code isn't right, or it has expired.");

  const {
    data: { user: after },
  } = await supabase.auth.getUser();
  const completed = (after?.email ?? "").toLowerCase() === target.toLowerCase();
  if (completed) {
    const { error: syncError } = await supabase.rpc("sync_my_email");
    // Not fatal: /account self-heals the profile whenever the two disagree.
    if (syncError) logEvent("auth.email_change.sync_failed", { reason: syncError.message });
  }

  revalidatePath("/account");
  return actionOk({ completed });
}
