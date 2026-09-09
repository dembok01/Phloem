import { z } from "zod";
import { actionFail, actionFromError, actionOk, type ActionResult } from "@/lib/action-result";

/**
 * The admin's one destructive lever on a member, kept pure so it can be tested
 * without a database (same shape as lib/member-enrollment.ts).
 *
 * The guard that matters lives in the `delete_member` RPC, not here: this only
 * refuses obviously malformed input so a typo cannot spend a round trip. The
 * name confirmation is re-checked in SQL, so a caller bypassing this form still
 * cannot delete the wrong member.
 */
const deletionSchema = z.object({
  member_id: z.string().uuid(),
  confirm_name: z.string().trim().min(1).max(120),
});

/** Per-table row counts the cascade removed, as returned by the RPC. */
export type DeletedRowCount = { table: string; count: number };

export type DeletedMember = {
  memberName: string;
  status: string | null;
  /** Only tables that actually lost rows, alphabetical — the summary the toast reads. */
  deleted: DeletedRowCount[];
};

type DeleteMemberArgs = { p_member: string; p_confirm_name: string };

type DeleteMemberRpc = (
  args: DeleteMemberArgs,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export type MemberDeletionResult = ActionResult<DeletedMember>;
export type MemberDeletionState = MemberDeletionResult | null;

const snapshotSchema = z.object({
  full_name: z.string().optional(),
  status: z.string().nullable().optional(),
  deleted: z.record(z.string(), z.number()).optional(),
});

/** Turn the RPC's jsonb snapshot into the ordered, zero-free summary the UI shows. */
function readSnapshot(data: unknown, typedName: string): DeletedMember {
  const parsed = snapshotSchema.safeParse(data);
  if (!parsed.success) return { memberName: typedName, status: null, deleted: [] };

  const counts = parsed.data.deleted ?? {};
  return {
    memberName: parsed.data.full_name ?? typedName,
    status: parsed.data.status ?? null,
    deleted: Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([table, count]) => ({ table, count })),
  };
}

/** Validate the confirmation, delete through the RPC, and report the blast radius. */
export async function deleteMember(
  formData: FormData,
  deleteMemberRpc: DeleteMemberRpc,
): Promise<MemberDeletionResult> {
  const parsed = deletionSchema.safeParse({
    member_id: formData.get("member_id"),
    confirm_name: formData.get("confirm_name"),
  });
  if (!parsed.success) return actionFail("Invalid request.");

  const { data, error } = await deleteMemberRpc({
    p_member: parsed.data.member_id,
    p_confirm_name: parsed.data.confirm_name,
  });

  if (error) {
    return actionFromError(error, "Could not delete this member. Please try again.");
  }

  return actionOk(readSnapshot(data, parsed.data.confirm_name));
}
