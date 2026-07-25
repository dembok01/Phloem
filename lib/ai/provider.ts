import "server-only";
import { generateObject } from "ai";
import type { z } from "zod";
import { logError } from "@/lib/observe";

/**
 * The vendor seam for AI (T3.1). One place a model is invoked; gateway-routed
 * (Vercel AI Gateway) and model env-selected, so nothing is hard-wired to a
 * provider. Generation is OFF unless `AI_ENABLED=true` — the blueprint kill-switch.
 *
 * PHI boundary: callers pass prompts assembled by lib/ai/context (which never
 * touches member_contacts). Never hand raw contact identifiers to this module.
 */
export const AI_ENABLED = process.env.AI_ENABLED === "true";

// Env-selected, gateway-routed. Default is the current Sonnet-class model for
// drafting; override with AI_MODEL. Requires AI_GATEWAY_API_KEY (or Vercel OIDC).
const AI_MODEL = process.env.AI_MODEL || "anthropic/claude-sonnet-5";

/**
 * Structured draft generation against a Zod schema. Returns null when disabled or
 * on any failure — the human-in-the-loop path is unaffected and a missing draft
 * never blocks the workflow (drafts are optional assistance, never authoritative).
 */
export async function draftObject<T>(args: {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}): Promise<T | null> {
  if (!AI_ENABLED) return null;
  try {
    const { object } = await generateObject({
      model: AI_MODEL,
      schema: args.schema,
      system: args.system,
      prompt: args.prompt,
    });
    return object;
  } catch (e) {
    logError("ai.generate_failed", e, { model: AI_MODEL });
    return null;
  }
}
