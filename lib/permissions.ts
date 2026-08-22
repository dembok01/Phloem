// Cosmetic mirror of the §3 permission matrix for UI routing/affordances only.
// The enforcement boundary is Postgres RLS + security-definer RPCs (§5–§6).
import type { Database } from "./supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];

/** §10 role → landing. Admin still lands on /admin; the other shells are places
 * they may go, not places they start. */
export function roleHome(role: UserRole): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "coordinator":
      return "/coordinator";
    case "doctor":
    case "nutritionist":
    case "trainer":
    case "psychologist":
      return "/clinician/clients";
    case "caregiver":
    case "member":
      return "/portal";
  }
}

/**
 * Top-level app sections a role may browse.
 *
 * Every role but admin is fenced into exactly one shell. Admin gets three,
 * because §3 already grants them everything those shells read: every
 * coordinator RPC accepts 'admin' (several are admin-ONLY), and every table
 * behind /clinician carries an `admin … ALL` policy. This list widens no
 * permission — it only stops the middleware from redirecting an admin away
 * from data the database would hand them anyway.
 *
 * /portal stays out: the family shell is the one surface an admin has no
 * business standing inside, and it writes engagement signals on render.
 */
export function allowedPrefixes(role: UserRole): readonly string[] {
  switch (role) {
    case "admin":
      return ["/admin", "/coordinator", "/clinician"];
    case "coordinator":
      return ["/coordinator"];
    case "doctor":
    case "nutritionist":
    case "trainer":
    case "psychologist":
      return ["/clinician"];
    case "caregiver":
    case "member":
      return ["/portal"];
  }
}

export const APP_PREFIXES = ["/admin", "/coordinator", "/clinician", "/portal"] as const;
