"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// P-1 / CODE-REVIEW H-3 — flip a doctor/performance report's caregiver visibility
// through the audited §6 set_report_sharing RPC (clinicians have no UPDATE on
// reports by design). Admin-only; the RPC re-checks the role and the type.
const shareSchema = z.object({
  report_id: z.string().uuid(),
  member_id: z.string().uuid(),
  shared: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function setReportSharing(formData: FormData): Promise<void> {
  const member = String(formData.get("member_id") ?? "");
  const to = `/admin/members/${member}`;
  const parsed = shareSchema.safeParse({
    report_id: formData.get("report_id"),
    member_id: formData.get("member_id"),
    shared: formData.get("shared"),
  });
  if (!parsed.success) redirect(`${to}?error=invalid`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_report_sharing", {
    p_report: parsed.data.report_id,
    p_shared: parsed.data.shared,
  });
  if (error) redirect(`${to}?error=share_failed`);

  revalidatePath(to);
  redirect(`${to}?ok=${parsed.data.shared ? "shared" : "unshared"}`);
}
