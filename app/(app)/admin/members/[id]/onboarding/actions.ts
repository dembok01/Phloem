"use server";

// Correcting submitted onboarding answers (design §10). The summary is rebuilt
// with the same builder submit_onboarding uses and passed in, so the reissued
// report is as full as the original rather than a bare stub.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { computeRedFlags } from "@/lib/red-flags";
import { buildOnboardingSummary } from "@/lib/reports/build/onboarding-summary";
import { actionFail, actionFromError, actionOk, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  memberId: z.string().uuid(),
  patch: z.record(z.string().regex(/^[a-z0-9_]{1,60}$/), z.unknown()),
  reason: z.string().trim().min(1).max(500),
});

export async function amendOnboardingAction(
  memberId: string,
  patch: Record<string, unknown>,
  reason: string,
): Promise<ActionResult> {
  const parsed = schema.safeParse({ memberId, patch, reason });
  if (!parsed.success) return actionFail("Add a reason for the correction, then save.");
  if (Object.keys(parsed.data.patch).length === 0) return actionFail("Nothing changed.");

  const supabase = await createClient();

  const { data: templates } = await supabase.from("form_templates").select("id").eq("key", "onboarding");
  const templateIds = (templates ?? []).map((t) => t.id);
  const [{ data: member }, { data: response }] = await Promise.all([
    supabase.from("members").select("full_name").eq("id", parsed.data.memberId).maybeSingle(),
    templateIds.length === 0
      ? Promise.resolve({ data: null })
      : supabase
          .from("form_responses")
          .select("answers")
          .eq("member_id", parsed.data.memberId)
          .in("template_id", templateIds)
          .not("submitted_at", "is", null)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
  ]);
  if (!member || !response) return actionFail("There are no submitted onboarding answers to correct.");

  const merged = { ...((response.answers ?? {}) as Record<string, unknown>), ...parsed.data.patch };
  const content = buildOnboardingSummary({
    memberName: member.full_name,
    answers: merged,
    redFlags: computeRedFlags(merged),
  });

  const { error } = await supabase.rpc("amend_onboarding", {
    p_member: parsed.data.memberId,
    p_patch: parsed.data.patch as Json,
    p_reason: parsed.data.reason,
    p_report_content: content as unknown as Json,
  });
  if (error) return actionFromError(error, "Could not save the correction. Please try again.");

  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  revalidatePath(`/admin/members/${parsed.data.memberId}/onboarding`);
  return actionOk(undefined);
}
