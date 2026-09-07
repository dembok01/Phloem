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
});

type CreateMemberArgs = Database["public"]["Functions"]["create_member_with_invite"]["Args"];

type CreateMemberRpc = (
  args: CreateMemberArgs,
) => Promise<{ data: string | null; error: { message: string } | null }>;

export type CreatedMemberInvite = {
  memberName: string;
  caregiverEmail: string;
  inviteUrl: string;
};

export type MemberEnrollmentResult = ActionResult<CreatedMemberInvite>;
export type MemberEnrollmentState = MemberEnrollmentResult | null;

/** Validate enrollment input, create the member/invite atomically, and surface its exact link. */
export async function enrollMember(
  formData: FormData,
  createMemberRpc: CreateMemberRpc,
): Promise<MemberEnrollmentResult> {
  const parsed = enrollmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return actionFail("Please check the required fields (name, age, and caregiver email).");
  }

  const value = parsed.data;
  const { data: token, error } = await createMemberRpc({
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
  });

  if (error) return actionFromError(error, "Could not enroll the member. Please try again.");
  if (!token) {
    return actionFail(
      "The member was enrolled, but an invite link was not returned. Check Invites before retrying.",
    );
  }

  return actionOk({
    memberName: value.full_name,
    caregiverEmail: value.caregiver_email,
    inviteUrl: inviteUrl(token),
  });
}
