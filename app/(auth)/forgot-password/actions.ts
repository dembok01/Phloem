"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/notify";
import { logEvent, logError } from "@/lib/observe";

const schema = z.object({ email: z.string().email().max(255) });

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

/**
 * Send a password-reset link.
 *
 * The token is minted by GoTrue (`generateLink`) but delivered by OUR mailer, so
 * the flow uses the Resend key + dev console fallback the rest of §12 uses rather
 * than depending on Supabase's built-in SMTP. Mailing `hashed_token` ourselves
 * (instead of `resetPasswordForEmail`) also makes the link work in a different
 * browser from the one that asked — the common case, where the request is made on
 * a laptop and the email is opened on a phone.
 *
 * The response is identical for a known and an unknown address: a form that says
 * "no such account" is an enumeration oracle, and these accounts identify the
 * families of chronic-care patients.
 *
 * ponytail: no per-IP throttle — GoTrue's own rate limit is the only ceiling.
 * Add one if this is ever abused to mail-bomb a known address.
 */
export async function requestPasswordReset(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect("/forgot-password?error=invalid");
  const email = parsed.data.email.trim().toLowerCase();

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });

  if (error || !data.properties) {
    // No such user, or GoTrue refused. Logged, never shown.
    logEvent("auth.reset.no_send", { reason: error?.message ?? "no_properties" });
  } else {
    const link = `${APP_URL}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery`;
    const ok = await sendEmail(
      email,
      "Reset your PHLOEM password",
      [
        "Someone asked to reset the password for this PHLOEM account.",
        "",
        "Open this link to choose a new one:",
        link,
        "",
        "The link can be used once and expires in about an hour.",
        "If this wasn't you, you can ignore this email — nothing has changed.",
      ].join("\n"),
    );
    if (!ok) logError("auth.reset.email_failed", "reset link email was not accepted");
  }

  redirect("/forgot-password?sent=1");
}
