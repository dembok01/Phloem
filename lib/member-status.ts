// §10 member_status presentation shared by the coordinator pipeline, today queue,
// and member page. Labels + pipeline column mapping + badge variant.
import type { Database } from "@/lib/supabase/database.types";

export type MemberStatus = Database["public"]["Enums"]["member_status"];
export type CareRole = Database["public"]["Enums"]["care_role"];

export const CARE_ROLES: CareRole[] = ["doctor", "nutritionist", "trainer", "psychologist"];

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  invited: "Invited",
  signed_up: "Signed up",
  onboarding: "Onboarding",
  onboarded: "Onboarded",
  assigned: "Care team assigned",
  initial_consults: "Initial consults",
  ready_to_start: "Ready to start",
  active: "Active",
  renewal_due: "Renewal due",
  inactive: "Inactive",
};

export function memberStatusVariant(
  s: MemberStatus,
): "default" | "muted" | "success" | "warning" {
  if (s === "active") return "success";
  if (s === "renewal_due") return "warning";
  if (s === "inactive" || s === "invited") return "muted";
  return "default";
}

// §10 pipeline board columns (member_status buckets).
export const PIPELINE_COLUMNS: { key: string; label: string; statuses: MemberStatus[] }[] = [
  { key: "invited", label: "Invited", statuses: ["invited", "signed_up"] },
  { key: "onboarding", label: "Onboarding", statuses: ["onboarding"] },
  { key: "onboarded", label: "Onboarded", statuses: ["onboarded"] },
  { key: "initial", label: "Initial Consults", statuses: ["assigned", "initial_consults", "ready_to_start"] },
  { key: "active", label: "Active", statuses: ["active"] },
  { key: "renewal", label: "Renewal Due", statuses: ["renewal_due"] },
  { key: "inactive", label: "Inactive", statuses: ["inactive"] },
];
