// T3.1 — PHI-bounded context assembly for AI drafts. The one rule: member_contacts
// (§4 contact identifiers) NEVER enters a prompt. Enforced two ways:
//   1. structurally — assembleMemberContext queries `members` (demographics) and
//      `get_onboarding_scoped` (role-scoped answers), NEVER `member_contacts`;
//   2. defensively — buildMemberContext strips the §4 keys and assertPhiFree throws
//      if any survive. Reads go through the CALLER's RLS client, so the AI can only
//      ever see what the caller is allowed to see.
//
// Pure of any server-only import (the Supabase client is injected as a param), so
// the PHI guarantees are unit-testable without a database.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** §4 contact identifiers — must never reach a model. */
export const PHI_STRIP_KEYS = [
  "contact_number",
  "phone",
  "whatsapp",
  "email",
  "address",
  "pin_code",
  "emergency_contact_name",
  "emergency_contact_phone",
] as const;

export type MemberContext = {
  member: {
    full_name: string;
    age: number | null;
    gender: string | null;
    city: string | null;
    language: string | null;
  };
  /** Role-scoped onboarding answers (via get_onboarding_scoped), §4 keys stripped. */
  onboarding: Record<string, unknown> | null;
  reports: { type: string; created_at: string; content: unknown }[];
};

function stripPhi(obj: Record<string, unknown>): Record<string, unknown> {
  const strip = new Set<string>(PHI_STRIP_KEYS);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (strip.has(k)) continue;
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? stripPhi(v as Record<string, unknown>) : v;
  }
  return out;
}

/** Throw if any §4 contact key appears anywhere in the assembled context. */
export function assertPhiFree(ctx: MemberContext): void {
  const blob = JSON.stringify(ctx);
  const leaked = PHI_STRIP_KEYS.filter((k) => blob.includes(`"${k}"`));
  if (leaked.length > 0) throw new Error(`AI context contains PHI keys: ${leaked.join(", ")}`);
}

/** Pure assembler: strips §4 keys from onboarding, then asserts the result is clean. */
export function buildMemberContext(input: {
  member: MemberContext["member"];
  onboarding: unknown;
  reports: MemberContext["reports"];
}): MemberContext {
  const onboarding =
    input.onboarding && typeof input.onboarding === "object" && !Array.isArray(input.onboarding)
      ? stripPhi(input.onboarding as Record<string, unknown>)
      : null;
  const ctx: MemberContext = { member: input.member, onboarding, reports: input.reports };
  assertPhiFree(ctx);
  return ctx;
}

/**
 * Assemble a member's AI context via the CALLER's RLS client (never the admin
 * client). member_contacts is deliberately never queried — a structural PHI
 * boundary. Onboarding comes through get_onboarding_scoped so each role's AI sees
 * only that role's scoped answers.
 */
export async function assembleMemberContext(
  supabase: Client,
  memberId: string,
): Promise<MemberContext | null> {
  const { data: member } = await supabase
    .from("members")
    .select("full_name, age, gender, city, language") // NO contact columns
    .eq("id", memberId)
    .maybeSingle();
  if (!member) return null;

  const { data: onboarding } = await supabase.rpc("get_onboarding_scoped", { m: memberId });
  const { data: reports } = await supabase
    .from("reports")
    .select("type, created_at, content")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(8);

  return buildMemberContext({
    member,
    onboarding,
    reports: (reports ?? []).map((r) => ({ type: r.type, created_at: r.created_at, content: r.content })),
  });
}
