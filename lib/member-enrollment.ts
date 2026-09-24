import { z } from "zod";
import { actionFail, actionFromError, actionOk, type ActionResult } from "@/lib/action-result";
import { inviteUrl } from "@/lib/invite";
import type { Database } from "@/lib/supabase/database.types";

const enrollmentSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  age: z.coerce.number().int().min(0).max(130),
  caregiver_email: z.string().trim().email().max(160),
  gender: z.string().trim().max(40).optional(),
  language: z.string().trim().max(60).optional(),
  occupation: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  relationship_to_caregiver: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(40).optional(),
  whatsapp: z.string().trim().max(40).optional(),
  email: z.union([z.literal(""), z.string().trim().email().max(160)]).optional(),
  address: z.string().trim().max(300).optional(),
  pin_code: z.string().trim().max(20).optional(),
  emergency_contact_name: z.string().trim().max(120).optional(),
  emergency_contact_phone: z.string().trim().max(40).optional(),
  duration_months: z.coerce.number().int().min(1).max(24).default(3),
  // Set only by the second submit, after the coordinator has confirmed the
  // account the RPC found belongs to the family they meant. Matched as a
  // literal rather than coerced: Boolean("false") is true, which would arm the
  // link on exactly the input meant to disarm it.
  link_existing: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

/**
 * The three shapes 0049's `create_member_with_invite` returns. `confirm_link`
 * wrote nothing — it is the RPC asking whether the caregiver account it found
 * at that address is really this family, because a mistyped address that
 * happens to belong to someone else would otherwise hand them a stranger's
 * health record.
 */
const rpcResultSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("confirm_link"),
    caregiver_name: z.string().nullable(),
    caregiver_email: z.string(),
    existing_members: z.array(z.string()),
  }),
  z.object({ mode: z.literal("invited"), member_id: z.string(), token: z.string() }),
  z.object({
    mode: z.literal("linked"),
    member_id: z.string(),
    caregiver_id: z.string(),
    caregiver_name: z.string().nullable(),
  }),
]);

type CreateMemberArgs = Database["public"]["Functions"]["create_member_with_invite"]["Args"];

type CreateMemberRpc = (
  args: CreateMemberArgs,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** A brand-new caregiver: there is a link to copy and send. */
export type CreatedMemberInvite = {
  outcome: "invited";
  memberName: string;
  caregiverEmail: string;
  inviteUrl: string;
};

/** An existing caregiver: the member is already on their account, no link needed. */
export type LinkedMember = {
  outcome: "linked";
  memberName: string;
  caregiverEmail: string;
  caregiverName: string | null;
};

/**
 * Nothing was written yet — the coordinator has to confirm the account first.
 *
 * `fields` echoes what they typed. React resets an uncontrolled form once its
 * action resolves, so without this the confirm step would hand back an empty
 * form and the whole enrollment would have to be retyped to answer one question.
 */
export type PendingCaregiverLink = {
  outcome: "confirm_link";
  memberName: string;
  caregiverEmail: string;
  caregiverName: string | null;
  existingMembers: string[];
  fields: Record<string, string>;
};

export type MemberEnrollmentOutcome =
  | CreatedMemberInvite
  | LinkedMember
  | PendingCaregiverLink;

export type MemberEnrollmentResult = ActionResult<MemberEnrollmentOutcome>;
export type MemberEnrollmentState = MemberEnrollmentResult | null;

/** Validate enrollment input, create or link the member, and surface what happened. */
export async function enrollMember(
  formData: FormData,
  createMemberRpc: CreateMemberRpc,
): Promise<MemberEnrollmentResult> {
  const parsed = enrollmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return actionFail("Please check the required fields (name, age, and caregiver email).");
  }

  const value = parsed.data;
  const { data, error } = await createMemberRpc({
    p_full_name: value.full_name,
    p_age: value.age,
    p_gender: value.gender ?? "",
    p_language: value.language ?? "",
    p_occupation: value.occupation ?? "",
    p_city: value.city ?? "",
    p_country: value.country ?? "",
    p_relationship_to_caregiver: value.relationship_to_caregiver ?? "",
    p_phone: value.phone ?? "",
    p_whatsapp: value.whatsapp ?? "",
    p_email: value.email ?? "",
    p_address: value.address ?? "",
    p_pin_code: value.pin_code ?? "",
    p_emergency_contact_name: value.emergency_contact_name ?? "",
    p_emergency_contact_phone: value.emergency_contact_phone ?? "",
    p_caregiver_email: value.caregiver_email,
    p_duration_months: value.duration_months,
    p_link_existing: value.link_existing,
  });

  if (error) return actionFromError(error, "Could not enroll the member. Please try again.");

  const result = rpcResultSchema.safeParse(data);
  if (!result.success) {
    return actionFail(
      "The member may have been enrolled, but the result could not be read. Check Members before retrying.",
    );
  }

  if (result.data.mode === "confirm_link") {
    const fields: Record<string, string> = {};
    for (const [key, entry] of formData.entries()) {
      if (key !== "link_existing" && typeof entry === "string") fields[key] = entry;
    }
    return actionOk({
      outcome: "confirm_link",
      memberName: value.full_name,
      caregiverEmail: result.data.caregiver_email,
      caregiverName: result.data.caregiver_name,
      existingMembers: result.data.existing_members,
      fields,
    });
  }

  if (result.data.mode === "linked") {
    return actionOk({
      outcome: "linked",
      memberName: value.full_name,
      caregiverEmail: value.caregiver_email,
      caregiverName: result.data.caregiver_name,
    });
  }

  return actionOk({
    outcome: "invited",
    memberName: value.full_name,
    caregiverEmail: value.caregiver_email,
    inviteUrl: inviteUrl(result.data.token),
  });
}
