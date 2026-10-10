"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteMember,
  type MemberDeletionResult,
  type MemberDeletionState,
} from "@/lib/member-deletion";
import { actionFail, actionFromError, actionOk, type ActionResult } from "@/lib/action-result";

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

// ── Deleting a member ────────────────────────────────────────────────────────
// The admin's undo for a mis-enrolment (0034). Everything that enforces this
// lives in `delete_member`: admin-only, the typed name must match, and the
// cascade + audit snapshot happen in one transaction. This action's only jobs
// are to hand the RPC its arguments and to sweep the three storage buckets,
// which no SQL cascade can reach.
export async function deleteMemberAction(
  _previousState: MemberDeletionState,
  formData: FormData,
): Promise<MemberDeletionResult> {
  const supabase = await createClient();
  const memberId = String(formData.get("member_id") ?? "");

  const result = await deleteMember(formData, async (args) => {
    const { data, error } = await supabase.rpc("delete_member", args);
    return { data, error };
  });
  if (!result.ok) return result;

  // Best-effort, and deliberately after the RPC: the database is already
  // consistent, so a storage hiccup must not read as a failed deletion. Every
  // bucket keys on the member id as its first folder segment (0011, 0014, §8).
  await removeMemberObjects(memberId);

  revalidatePath("/admin/members");
  revalidatePath("/admin/invites");

  // Redirect from the action, not from an effect in the component. A server
  // action re-renders the route the caller is standing on — which is this
  // member's page, whose first statement is now `notFound()`. A client-side
  // replace runs after that render and loses the race every time, so the admin
  // saw the 404 page instead of their member list. redirect() navigates as part
  // of the action's own response, so the deleted page is never rendered.
  redirect("/admin/members?ok=deleted");
}

async function removeMemberObjects(memberId: string): Promise<void> {
  const admin = createAdminClient();
  for (const bucket of ["member-photos", "documents", "reports"] as const) {
    try {
      const { data: objects } = await admin.storage.from(bucket).list(memberId);
      const paths = (objects ?? []).map((o) => `${memberId}/${o.name}`);
      if (paths.length > 0) await admin.storage.from(bucket).remove(paths);
    } catch (error) {
      console.error(`[member.deleted] ${bucket} sweep failed for ${memberId}`, error);
    }
  }
}

// ── Moving a member to a different family login (design §9) ──────────────────
const transferSchema = z.object({
  memberId: z.string().uuid(),
  newUserId: z.string().uuid(),
});

export async function transferCaregiverAction(
  memberId: string,
  newUserId: string,
): Promise<ActionResult> {
  const parsed = transferSchema.safeParse({ memberId, newUserId });
  if (!parsed.success) return actionFail("Invalid request.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_caregiver", {
    p_member: parsed.data.memberId,
    p_new_user: parsed.data.newUserId,
  });
  if (error) {
    return actionFromError(error, "Could not move this member. Please try again.", {
      role_mismatch_or_inactive: "That login isn't an active family account.",
    });
  }

  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  revalidatePath("/portal");
  return actionOk(undefined);
}

const inviteSchema = z.object({
  memberId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(255),
});

/**
 * For an incoming caregiver with no account yet. replace_caregiver_invite (0043)
 * expires any invite still outstanding and inserts the new one in one transaction,
 * so only one link is ever live. It also refuses a member past 'invited' while the
 * live accept_invite would reset them (0041 is held for approval).
 */
export async function inviteReplacementCaregiverAction(
  memberId: string,
  email: string,
): Promise<ActionResult> {
  const parsed = inviteSchema.safeParse({ memberId, email });
  if (!parsed.success) return actionFail("Enter a valid email address.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_caregiver_invite", {
    p_member: parsed.data.memberId,
    p_email: parsed.data.email,
  });
  if (error) return actionFromError(error, "Could not create that invite. Please try again.");

  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  revalidatePath("/admin/invites");
  return actionOk(undefined);
}
