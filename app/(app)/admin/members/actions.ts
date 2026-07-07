"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Enrollment (§6 create_member_with_invite). Core identity is required; the rest
// is provisional and gets overwritten from the questionnaire during onboarding.
// The RPC's non-default params are non-null in the generated types, so omitted
// optional text is sent as "" (logged assumption).
const enrollSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  age: z.coerce.number().int().min(0).max(130),
  caregiver_email: z.string().email(),
  gender: z.string().trim().max(40).optional(),
  language: z.string().trim().max(60).optional(),
  occupation: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  relationship_to_caregiver: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(40).optional(),
  whatsapp: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
  address: z.string().trim().max(300).optional(),
  pin_code: z.string().trim().max(20).optional(),
  emergency_contact_name: z.string().trim().max(120).optional(),
  emergency_contact_phone: z.string().trim().max(40).optional(),
  duration_months: z.coerce.number().int().min(1).max(24).default(3),
});

export async function createMember(formData: FormData): Promise<void> {
  const parsed = enrollSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/members/new?error=invalid");
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_member_with_invite", {
    p_full_name: v.full_name,
    p_age: v.age,
    p_gender: v.gender ?? "",
    p_language: v.language ?? "",
    p_occupation: v.occupation ?? "",
    p_city: v.city ?? "",
    p_country: v.country ?? "",
    p_relationship_to_caregiver: v.relationship_to_caregiver ?? "",
    p_phone: v.phone ?? "",
    p_whatsapp: v.whatsapp ?? "",
    p_email: v.email ?? "",
    p_address: v.address ?? "",
    p_pin_code: v.pin_code ?? "",
    p_emergency_contact_name: v.emergency_contact_name ?? "",
    p_emergency_contact_phone: v.emergency_contact_phone ?? "",
    p_caregiver_email: v.caregiver_email,
    p_duration_months: v.duration_months,
  });
  if (error) redirect("/admin/members/new?error=enroll_failed");

  revalidatePath("/admin/members");
  revalidatePath("/admin/invites");
  redirect("/admin/invites?created=1");
}
