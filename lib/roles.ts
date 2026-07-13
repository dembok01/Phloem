// Presentation-layer role vocabulary: one human label + one hue per role,
// used by the shell, chips, and avatars (DESIGN-SYSTEM.md §1 role hues).
import type { Database } from "@/lib/supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];
export type CareRole = Database["public"]["Enums"]["care_role"];

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  coordinator: "Care Coordinator",
  doctor: "Doctor",
  nutritionist: "Nutritionist",
  trainer: "Trainer",
  psychologist: "Psychologist",
  caregiver: "Family",
  member: "Member",
};

/** Tailwind classes for a role-tinted chip (text + soft fill). */
export const ROLE_CHIP: Record<UserRole, string> = {
  admin: "text-role-admin bg-role-admin/10",
  coordinator: "text-role-coordinator bg-role-coordinator/10",
  doctor: "text-role-doctor bg-role-doctor/10",
  nutritionist: "text-role-nutritionist bg-role-nutritionist/10",
  trainer: "text-role-trainer bg-role-trainer/10",
  psychologist: "text-role-psychologist bg-role-psychologist/10",
  caregiver: "text-role-caregiver bg-role-caregiver/10",
  member: "text-role-member bg-role-member/10",
};

/** The 2px context line under the app header — each shell carries its role hue. */
export const ROLE_ACCENT_BAR: Record<UserRole, string> = {
  admin: "bg-role-admin",
  coordinator: "bg-role-coordinator",
  doctor: "bg-role-doctor",
  nutritionist: "bg-role-nutritionist",
  trainer: "bg-role-trainer",
  psychologist: "bg-role-psychologist",
  caregiver: "bg-role-caregiver",
  member: "bg-role-member",
};
