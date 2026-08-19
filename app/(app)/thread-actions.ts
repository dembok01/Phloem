"use server";

// W2 — conversation actions, shared by every surface that shows threads (portal,
// clinician shell, coordinator and admin member pages), the way
// app/(app)/program-actions.ts is shared.
//
// Each one is a thin, Zod-validated wrapper over a §6-style RPC. The RPCs decide
// who may read, write, and close a thread — including the rule that keeps the
// psychologist out of care-team and family threads — so these actions never
// re-implement permission logic. They only shape input and revalidate.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { actionOk, actionFail, actionFromError, type ActionResult } from "@/lib/action-result";

const CARE_ROLES = ["doctor", "nutritionist", "trainer", "psychologist"] as const;

const startSchema = z.object({
  member_id: z.string().uuid(),
  kind: z.enum(["care_team", "family", "case", "psych"]),
  subject: z.string().trim().min(1, "Give the conversation a subject.").max(200),
  audience: z.array(z.enum(CARE_ROLES)).optional(),
  case_id: z.string().uuid().optional(),
  /** optional opening message, so "ask a question" is one step, not two */
  body: z.string().trim().max(4000).optional(),
});

export async function startThread(input: {
  member_id: string;
  kind: string;
  subject: string;
  audience?: string[];
  case_id?: string;
  body?: string;
}): Promise<ActionResult<string>> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    return actionFail(parsed.error.issues[0]?.message ?? "Check the conversation details.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_thread", {
    p_member: parsed.data.member_id,
    p_kind: parsed.data.kind,
    p_subject: parsed.data.subject,
    p_audience: parsed.data.audience?.length ? parsed.data.audience : undefined,
    p_case: parsed.data.case_id,
  });
  if (error) {
    return actionFromError(error, "Could not start that conversation.", {
      not_allowed: "You can't start that kind of conversation for this member.",
    });
  }

  const threadId = data as unknown as string;
  if (parsed.data.body) {
    const { error: msgError } = await supabase.rpc("post_message", {
      p_thread: threadId,
      p_body: parsed.data.body,
    });
    // The thread exists either way; report the message failure without losing it.
    if (msgError) {
      return actionFromError(msgError, "The conversation was created, but the message didn't send.");
    }
  }

  revalidateFor(parsed.data.member_id);
  return actionOk(threadId);
}

const postSchema = z.object({
  thread_id: z.string().uuid(),
  member_id: z.string().uuid(),
  body: z.string().trim().min(1, "Write a message before sending.").max(4000),
});

export async function postMessage(input: {
  thread_id: string;
  member_id: string;
  body: string;
}): Promise<ActionResult> {
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) {
    return actionFail(parsed.error.issues[0]?.message ?? "Write a message before sending.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_message", {
    p_thread: parsed.data.thread_id,
    p_body: parsed.data.body,
  });
  if (error) {
    return actionFromError(error, "Your message didn't send. Please try again.", {
      not_allowed: "You don't have access to this conversation.",
    });
  }
  revalidateFor(parsed.data.member_id);
  return actionOk(undefined);
}

const readSchema = z.object({ thread_id: z.string().uuid() });

export async function markThreadRead(input: { thread_id: string }): Promise<ActionResult> {
  const parsed = readSchema.safeParse(input);
  if (!parsed.success) return actionFail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_thread_read", { p_thread: parsed.data.thread_id });
  if (error) return actionFromError(error, "Could not mark this as read.");
  return actionOk(undefined);
}

const resolveSchema = z.object({
  thread_id: z.string().uuid(),
  member_id: z.string().uuid(),
  resolved: z.boolean(),
});

export async function resolveThread(input: {
  thread_id: string;
  member_id: string;
  resolved: boolean;
}): Promise<ActionResult> {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return actionFail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_thread", {
    p_thread: parsed.data.thread_id,
    p_resolved: parsed.data.resolved,
  });
  if (error) return actionFromError(error, "Could not update this conversation.");
  revalidateFor(parsed.data.member_id);
  return actionOk(undefined);
}

/** One conversation shows up on four surfaces; a reply on any of them should be
 *  visible on the others without a hard reload. */
function revalidateFor(memberId: string): void {
  revalidatePath(`/portal/members/${memberId}/messages`);
  revalidatePath(`/clinician/clients/${memberId}`);
  revalidatePath(`/coordinator/members/${memberId}`);
  revalidatePath(`/admin/members/${memberId}`);
}
