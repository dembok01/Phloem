import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/roles";

export type SessionProfile = {
  user: User;
  full_name: string;
  role: UserRole;
  status: string;
};

// Request-scoped identity + profile. Wrapped in React `cache()` so the layout AND
// the page it renders share ONE getUser() + ONE profiles query per request instead
// of each repeating the pair sequentially (the dominant per-navigation latency).
// getUser() is a network round-trip to Supabase Auth, so deduping it matters.
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, status")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return {
    user,
    full_name: profile.full_name,
    role: profile.role as UserRole,
    status: profile.status,
  };
});
