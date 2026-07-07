"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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
