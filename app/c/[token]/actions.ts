"use server";

// W3.2 — the check-in submit, from an UNAUTHENTICATED visitor.
//
// The action takes a token and answers, nothing else. It cannot be pointed at a
// different member: `submit_checkin` resolves the member from the token itself, so
// there is no member id in this file to tamper with.
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  token: z.string().uuid(),
  how_is_feeling: z.enum(["1", "2", "3", "4", "5"]),
  following_plan: z.enum(["well", "mostly", "struggling"]),
  concerns: z.string().trim().max(2000).optional(),
  question: z.string().trim().max(2000).optional(),
  needs_call: z.boolean().optional(),
});

export type CheckinResult =
  | { ok: true; concern: boolean }
  | { ok: false; error: string };

export async function submitCheckin(input: unknown): Promise<CheckinResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please answer the first two questions before sending." };
  }
  const { token, ...answers } = parsed.data;

  // The anon client: no session required, and the RPC is the only thing this
  // visitor is permitted to call.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_checkin", {
    p_token: token,
    p_answers: {
      how_is_feeling: answers.how_is_feeling,
      following_plan: answers.following_plan,
      concerns: answers.concerns ?? "",
      question: answers.question ?? "",
      needs_call: answers.needs_call ? "true" : "false",
    },
  });

  if (error) return { ok: false, error: "Something went wrong. Please try again." };

  const result = (data ?? {}) as { ok?: boolean; concern?: boolean; reason?: string };
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "already_today"
          ? "You've already answered today — thank you. The care team will be in touch."
          : "This link has expired. Ask your care coordinator for a new one.",
    };
  }
  return { ok: true, concern: !!result.concern };
}
