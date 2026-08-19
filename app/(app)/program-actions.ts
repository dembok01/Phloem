"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorCode, type RpcErrorCode } from "@/lib/rpc-errors";
import { actionOk, actionFail, actionFromError, type ActionResult } from "@/lib/action-result";

// §6 program-lifecycle actions shared by the coordinator + admin member pages.
// Every mutation goes through a §6 RPC, which is the enforcement boundary: a
// coordinator calling reactivate/deactivate is rejected by the RPC (admin-only),
// so these thin wrappers never need to re-check the role.

const id = z.string().uuid();
const months = z.coerce.number().int().min(1).max(24);

// Redirect codes stay identical so the pages' ERROR copy maps keep working.
const REDIRECT_CODE: Partial<Record<RpcErrorCode, string>> = {
  initial_reports_incomplete: "initial_incomplete",
  no_package_to_start: "no_package",
  not_active: "not_active",
  not_paused: "not_paused",
  not_allowed: "not_allowed",
};
function code(message: string): string {
  const c = rpcErrorCode({ message });
  return (c && REDIRECT_CODE[c]) ?? "failed";
}

function to(formData: FormData): string {
  const raw = String(formData.get("redirect_to") ?? "/coordinator/pipeline");
  // Only allow internal paths.
  return raw.startsWith("/") ? raw.split("?")[0] : "/coordinator/pipeline";
}
// Success codes are verb-specific so the toast can repeat the button's verb (C1).
function back(path: string, error?: string, ok = "done"): never {
  redirect(error ? `${path}?error=${error}` : `${path}?ok=${ok}`);
}

export async function activateProgram(formData: FormData): Promise<void> {
  const path = to(formData);
  const member = id.safeParse(formData.get("member_id"));
  if (!member.success) back(path, "invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("activate_program", { p_member: member.data });
  if (error) back(path, code(error.message));
  revalidatePath(path);
  back(path, undefined, "activated");
}

export async function pauseProgram(formData: FormData): Promise<void> {
  const path = to(formData);
  const pkg = id.safeParse(formData.get("package_id"));
  if (!pkg.success) back(path, "invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("pause_program", { p_package: pkg.data });
  if (error) back(path, code(error.message));
  revalidatePath(path);
  back(path, undefined, "paused");
}

export async function resumeProgram(formData: FormData): Promise<void> {
  const path = to(formData);
  const pkg = id.safeParse(formData.get("package_id"));
  if (!pkg.success) back(path, "invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("resume_program", { p_package: pkg.data });
  if (error) back(path, code(error.message));
  revalidatePath(path);
  back(path, undefined, "resumed");
}

export async function setPackageDuration(formData: FormData): Promise<void> {
  const path = to(formData);
  const pkg = id.safeParse(formData.get("package_id"));
  const m = months.safeParse(formData.get("months"));
  if (!pkg.success || !m.success) back(path, "invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_package_duration", {
    p_package: pkg.data,
    p_months: m.data,
  });
  if (error) back(path, code(error.message));
  revalidatePath(path);
  back(path, undefined, "duration_saved");
}

export async function deactivateMember(formData: FormData): Promise<void> {
  const path = to(formData);
  const member = id.safeParse(formData.get("member_id"));
  if (!member.success) back(path, "invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("deactivate_member", { p_member: member.data });
  if (error) back(path, code(error.message));
  revalidatePath(path);
  back(path, undefined, "deactivated");
}

export async function reactivateMember(formData: FormData): Promise<void> {
  const path = to(formData);
  const member = id.safeParse(formData.get("member_id"));
  const m = months.safeParse(formData.get("months"));
  if (!member.success || !m.success) back(path, "invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reactivate_member", {
    p_member: member.data,
    p_duration_months: m.data,
  });
  if (error) back(path, code(error.message));
  revalidatePath(path);
  back(path, undefined, "reactivated");
}

// ============ W3.2 — family check-in links ============
// The coordinator generates a URL and sends it over WhatsApp. create_checkin_link
// reuses a live link rather than minting a second one, so pressing the button twice
// is safe and the family only ever holds one working URL.

const checkinLinkSchema = z.object({ member_id: z.string().uuid() });

export async function createCheckinLink(input: {
  member_id: string;
}): Promise<ActionResult<string>> {
  const parsed = checkinLinkSchema.safeParse(input);
  if (!parsed.success) return actionFail("Invalid request.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_checkin_link", {
    p_member: parsed.data.member_id,
  });
  if (error) {
    return actionFromError(error, "Could not create a check-in link.", {
      not_allowed: "Only the coordinator, an admin, or an assigned clinician can create this link.",
    });
  }
  revalidatePath(`/coordinator/members/${parsed.data.member_id}`);
  revalidatePath(`/admin/members/${parsed.data.member_id}`);
  return actionOk(data as unknown as string);
}

const revokeSchema = z.object({ token: z.string().uuid(), member_id: z.string().uuid() });

export async function revokeCheckinLink(input: {
  token: string;
  member_id: string;
}): Promise<ActionResult> {
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return actionFail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_checkin_link", { p_token: parsed.data.token });
  if (error) return actionFromError(error, "Could not revoke that link.");
  revalidatePath(`/coordinator/members/${parsed.data.member_id}`);
  revalidatePath(`/admin/members/${parsed.data.member_id}`);
  return actionOk(undefined);
}

// ============ W4 — renewals (staff side) ============
// §3 splits this deliberately: the coordinator runs the renewal conversation and
// can record the family's answer, but only an ADMIN can complete it, because
// completing creates a package and §3 gives reactivation to admin alone. The RPCs
// enforce that split; these wrappers only shape input.

const proposeSchema = z.object({
  member_id: z.string().uuid(),
  months: z.coerce.number().int().min(1).max(24).optional(),
  note: z.string().trim().max(1000).optional(),
});

export async function proposeRenewal(input: {
  member_id: string;
  months?: number;
  note?: string;
}): Promise<ActionResult<string>> {
  const parsed = proposeSchema.safeParse(input);
  if (!parsed.success) return actionFail("Check the renewal details.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("propose_renewal", {
    p_member: parsed.data.member_id,
    p_months: parsed.data.months,
    p_note: parsed.data.note,
  });
  if (error) {
    return actionFromError(error, "Could not open a renewal.", {
      no_active_package: "There is no running programme to renew for this member.",
    });
  }
  revalidatePath(`/coordinator/members/${parsed.data.member_id}`);
  revalidatePath(`/admin/members/${parsed.data.member_id}`);
  return actionOk(data as unknown as string);
}

const recordAnswerSchema = z.object({
  renewal_id: z.string().uuid(),
  member_id: z.string().uuid(),
  intent: z.enum(["interested", "declined"]),
  note: z.string().trim().max(1000).optional(),
});

/** Record an answer the family gave by phone — which is how most of these arrive. */
export async function recordRenewalAnswer(input: {
  renewal_id: string;
  member_id: string;
  intent: string;
  note?: string;
}): Promise<ActionResult> {
  const parsed = recordAnswerSchema.safeParse(input);
  if (!parsed.success) return actionFail("Pick an answer to record.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_renewal", {
    p_renewal: parsed.data.renewal_id,
    p_intent: parsed.data.intent,
    p_note: parsed.data.note,
  });
  if (error) return actionFromError(error, "Could not record that answer.");
  revalidatePath(`/coordinator/members/${parsed.data.member_id}`);
  revalidatePath(`/admin/members/${parsed.data.member_id}`);
  return actionOk(undefined);
}

const completeSchema = z.object({
  renewal_id: z.string().uuid(),
  member_id: z.string().uuid(),
  months: z.coerce.number().int().min(1).max(24).optional(),
});

export async function completeRenewal(input: {
  renewal_id: string;
  member_id: string;
  months?: number;
}): Promise<ActionResult> {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return actionFail("Check the renewal details.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_renewal", {
    p_renewal: parsed.data.renewal_id,
    p_months: parsed.data.months,
  });
  if (error) {
    return actionFromError(error, "Could not start the new programme.", {
      not_allowed: "Only an admin can start the new programme (§3: reactivation is admin-only).",
      renewal_closed: "This renewal has already been settled.",
    });
  }
  revalidatePath(`/coordinator/members/${parsed.data.member_id}`);
  revalidatePath(`/admin/members/${parsed.data.member_id}`);
  return actionOk(undefined);
}
