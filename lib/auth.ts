import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/roles";

export type SessionProfile = {
  user: User;
  full_name: string;
  role: UserRole;
  status: string;
  /** True when this login should render in elderly mode (P-4). Elderly (`member`)
   * logins default on; any login can be switched via `display_prefs.elderly`. */
  elderly: boolean;
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
    .select("full_name, role, status, display_prefs")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  const role = profile.role as UserRole;
  const prefs = (profile.display_prefs ?? {}) as { elderly?: boolean };
  // Elderly (`member`) logins default to elderly-mode ON; the flag can turn it
  // off, and any other role can opt in. Preference persists server-side (P-4).
  const elderly = typeof prefs.elderly === "boolean" ? prefs.elderly : role === "member";

  return {
    user,
    full_name: profile.full_name,
    role,
    status: profile.status,
    elderly,
  };
});
