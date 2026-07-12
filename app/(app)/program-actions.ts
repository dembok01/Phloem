"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// §6 program-lifecycle actions shared by the coordinator + admin member pages.
// Every mutation goes through a §6 RPC, which is the enforcement boundary: a
// coordinator calling reactivate/deactivate is rejected by the RPC (admin-only),
// so these thin wrappers never need to re-check the role.

const id = z.string().uuid();
const months = z.coerce.number().int().min(1).max(24);

// Map raw RPC exceptions to short error codes the pages render.
const CODES: [string, string][] = [
  ["initial_reports_incomplete", "initial_incomplete"],
  ["no_package_to_start", "no_package"],
  ["not_active", "not_active"],
  ["not_paused", "not_paused"],
  ["not_allowed", "not_allowed"],
];
function code(message: string): string {
  for (const [needle, c] of CODES) if (message.includes(needle)) return c;
  return "failed";
}

function to(formData: FormData): string {
  const raw = String(formData.get("redirect_to") ?? "/coordinator/pipeline");
  // Only allow internal paths.
  return raw.startsWith("/") ? raw.split("?")[0] : "/coordinator/pipeline";
}
function back(path: string, error?: string): never {
  redirect(error ? `${path}?error=${error}` : `${path}?ok=1`);
}

export async function activateProgram(formData: FormData): Promise<void> {
  const path = to(formData);
  const member = id.safeParse(formData.get("member_id"));
  if (!member.success) back(path, "invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("activate_program", { p_member: member.data });
  if (error) back(path, code(error.message));
  revalidatePath(path);
  back(path);
}

export async function pauseProgram(formData: FormData): Promise<void> {
  const path = to(formData);
  const pkg = id.safeParse(formData.get("package_id"));
  if (!pkg.success) back(path, "invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("pause_program", { p_package: pkg.data });
  if (error) back(path, code(error.message));
  revalidatePath(path);
  back(path);
}

export async function resumeProgram(formData: FormData): Promise<void> {
  const path = to(formData);
  const pkg = id.safeParse(formData.get("package_id"));
  if (!pkg.success) back(path, "invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("resume_program", { p_package: pkg.data });
  if (error) back(path, code(error.message));
  revalidatePath(path);
  back(path);
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
  back(path);
}

export async function deactivateMember(formData: FormData): Promise<void> {
  const path = to(formData);
  const member = id.safeParse(formData.get("member_id"));
  if (!member.success) back(path, "invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("deactivate_member", { p_member: member.data });
  if (error) back(path, code(error.message));
  revalidatePath(path);
  back(path);
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
  back(path);
}
