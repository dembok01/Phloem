"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// P-2 — drag-and-drop transitions on the pipeline board.
//
// Most stage moves are side-effect-heavy and deliberately dialog-driven
// (assignment needs a person; scheduling needs a time) — a generic
// set_member_status would bypass the §6 invariants those dialogs enforce, so the
// board routes them to the member page instead. The ONE input-free forward move
// with a self-contained §6 RPC is starting the program for a ready member, so
// that is the only transition performed directly on drop. The RPC still enforces
// eligibility (all initial reports in) and role, so this wrapper stays thin.
const schema = z.object({ memberId: z.string().uuid(), targetColumn: z.string().min(1) });

type MoveResult =
  | { ok: true; message: string }
  | { ok: false; reason: "needs_dialog" | "ineligible" | "invalid" };

export async function movePipelineCard(memberId: string, targetColumn: string): Promise<MoveResult> {
  const parsed = schema.safeParse({ memberId, targetColumn });
  if (!parsed.success) return { ok: false, reason: "invalid" };

  if (parsed.data.targetColumn !== "active") {
    // Dropped somewhere that needs the member page's dialogs.
    return { ok: false, reason: "needs_dialog" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("activate_program", { p_member: parsed.data.memberId });
  if (error) return { ok: false, reason: "ineligible" };

  revalidatePath("/coordinator/pipeline");
  return { ok: true, message: "Program activated — it starts tomorrow" };
}
