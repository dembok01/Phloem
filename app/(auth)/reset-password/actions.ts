"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const passwordSchema = z.string().min(8).max(72);

/**
 * Set a new password for the recovery session established by /auth/confirm.
 *
 * The session — not any client-supplied identifier — decides whose password
 * changes, so a stale form cannot be aimed at another account. On success the
 * recovery session is torn down: the new password is proven at the sign-in
 * screen rather than assumed, and a shared or borrowed device is not left
 * holding a live session.
 */
export async function updatePassword(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!passwordSchema.safeParse(password).success) redirect("/reset-password?error=invalid");
  if (password !== confirm) redirect("/reset-password?error=mismatch");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/reset-password?error=link");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?error=failed");

  await supabase.auth.signOut();
  redirect("/login?notice=password_updated");
}
