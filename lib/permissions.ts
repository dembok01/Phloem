// Cosmetic mirror of the §3 permission matrix for UI routing/affordances only.
// The enforcement boundary is Postgres RLS + security-definer RPCs (§5–§6).
import type { Database } from "./supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];

/** §10 role → landing. */
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

/** Top-level app section a role is allowed to browse. */
export function allowedPrefix(role: UserRole): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "coordinator":
      return "/coordinator";
    case "doctor":
    case "nutritionist":
    case "trainer":
    case "psychologist":
      return "/clinician";
    case "caregiver":
    case "member":
      return "/portal";
  }
}

export const APP_PREFIXES = ["/admin", "/coordinator", "/clinician", "/portal"] as const;
