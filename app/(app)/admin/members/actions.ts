"use server";

import { revalidatePath } from "next/cache";
import {
  enrollMember,
  type MemberEnrollmentState,
} from "@/lib/member-enrollment";
import { createClient } from "@/lib/supabase/server";

export async function createMember(
  _previousState: MemberEnrollmentState,
  formData: FormData,
): Promise<MemberEnrollmentState> {
  const supabase = await createClient();
  const result = await enrollMember(formData, async (args) => {
    const { data, error } = await supabase.rpc("create_member_with_invite", args);
    return { data, error };
  });

  if (result.ok) {
    revalidatePath("/admin/members");
    revalidatePath("/admin/invites");
  }

  return result;
}
