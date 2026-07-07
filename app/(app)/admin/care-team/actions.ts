"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["doctor", "nutritionist", "trainer", "psychologist"]),
});

const statusSchema = z.object({
  user_id: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
});

/**
 * Invite a care-team professional. The invite row is written directly under the
 * `inv_admin` RLS policy (admin-only); §6 has no professional-invite RPC. The
 * account's role is fixed here in the invite and can only be claimed via the
 * token (see accept_invite). Lands on the invites list where the link is shown.
 */
export async function inviteProfessional(formData: FormData): Promise<void> {
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) redirect("/admin/care-team?error=invalid");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("invites")
    .insert({ email: parsed.data.email, role: parsed.data.role, invited_by: user.id });
  if (error) redirect("/admin/care-team?error=invite_failed");

  revalidatePath("/admin/care-team");
  revalidatePath("/admin/invites");
  redirect("/admin/invites?created=1");
}

/** Suspend or reactivate an account (audited RPC; instant DB-enforced lockout). */
export async function setAccountStatus(formData: FormData): Promise<void> {
  const parsed = statusSchema.safeParse({
    user_id: formData.get("user_id"),
    status: formData.get("status"),
  });
  if (!parsed.success) redirect("/admin/care-team?error=invalid");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_account_status", {
    p_user_id: parsed.data.user_id,
    p_status: parsed.data.status,
  });
  if (error) redirect("/admin/care-team?error=status_failed");

  revalidatePath("/admin/care-team");
  redirect("/admin/care-team");
}
