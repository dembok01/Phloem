"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/permissions";

const acceptSchema = z.object({
  token: z.string().uuid(),
  full_name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(72),
  phone: z.string().trim().max(40).optional(),
});

/**
 * Accept an invite (§6 `accept_invite`, end-to-end). Runs entirely server-side
 * with the service client because:
 *   1. the GoTrue Admin API creates the auth user (SQL cannot on hosted), and
 *   2. `accept_invite` is revoked from anon/authenticated — only the service
 *      role may call it, so the profile role can ONLY come from the invite row.
 * The password and name are the sole client-supplied values; role is never.
 */
export async function acceptInvite(formData: FormData): Promise<void> {
  const rawToken = String(formData.get("token") ?? "");
  const parsed = acceptSchema.safeParse({
    token: rawToken,
    full_name: formData.get("full_name"),
    password: formData.get("password"),
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) redirect(`/invite/${rawToken}?error=invalid`);
  const { token, full_name, password, phone } = parsed.data;

  const admin = createAdminClient();

  // Source of truth is the DB: re-validate the invite server-side.
  const { data: invite } = await admin
    .from("invites")
    .select("email, role, used_at, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!invite || invite.used_at || new Date(invite.expires_at).getTime() <= Date.now()) {
    redirect(`/invite/${token}?error=used`);
  }

  // Create the auth user with the invite's email (never client-supplied).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    redirect(`/invite/${token}?error=exists`);
  }

  // Atomically create the profile (role from invite) + link caregiver + burn token.
  const { error: rpcErr } = await admin.rpc("accept_invite", {
    p_token: token,
    p_user_id: created.user.id,
    p_full_name: full_name,
    p_phone: phone ?? undefined,
  });
  if (rpcErr) {
    // Undo the orphaned auth user so the invite can be retried cleanly.
    await admin.auth.admin.deleteUser(created.user.id);
    redirect(`/invite/${token}?error=failed`);
  }

  // Sign the new user in (sets @supabase/ssr cookies) and land them on their home.
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: invite.email,
    password,
  });
  if (signInErr) redirect("/login?notice=account_created");
  redirect(roleHome(invite.role));
}
