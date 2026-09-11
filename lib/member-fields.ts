// Cosmetic mirror of migration 0035's field whitelists, in the tradition of
// lib/permissions.ts: the enforcement boundary is the RPC, this only decides
// what the UI offers. lib/member-fields.test.ts asserts the two never drift.
import type { UserRole } from "@/lib/roles";

export type FieldType = "text" | "number" | "tel" | "email" | "select" | "textarea";

export type FieldSpec = {
  key: string;
  label: string;
  type: FieldType;
  /** Only for `select`. */
  options?: readonly string[];
  editableBy: readonly UserRole[];
  /** Shown under a field the current role may see but not change. */
  lockedReason?: string;
};

export type FieldGroup = {
  /** Used for form ids and the sheet's title. */
  name: string;
  fields: readonly FieldSpec[];
};

const ASK_COORDINATOR = "Your coordinator can change this.";

export const MEMBER_DEMOGRAPHICS: FieldGroup = {
  name: "Details",
  fields: [
    { key: "full_name", label: "Full name", type: "text",
      editableBy: ["admin"], lockedReason: ASK_COORDINATOR },
    { key: "age", label: "Age", type: "number",
      editableBy: ["admin"], lockedReason: ASK_COORDINATOR },
    { key: "gender", label: "Gender", type: "select",
      options: ["Female", "Male", "Other"],
      editableBy: ["admin"], lockedReason: ASK_COORDINATOR },
    { key: "language", label: "Preferred language", type: "text",
      editableBy: ["admin", "caregiver"] },
    { key: "occupation", label: "Occupation", type: "text",
      editableBy: ["admin", "caregiver"] },
    { key: "city", label: "City", type: "text",
      editableBy: ["admin", "caregiver"] },
    { key: "country", label: "Country", type: "text",
      editableBy: ["admin", "caregiver"] },
    { key: "relationship_to_caregiver", label: "Relationship to you", type: "text",
      editableBy: ["admin"], lockedReason: ASK_COORDINATOR },
  ],
};

export const MEMBER_CONTACTS: FieldGroup = {
  name: "Contact details",
  fields: [
    { key: "phone", label: "Phone", type: "tel", editableBy: ["admin", "caregiver"] },
    { key: "whatsapp", label: "WhatsApp", type: "tel", editableBy: ["admin", "caregiver"] },
    { key: "email", label: "Email", type: "email", editableBy: ["admin", "caregiver"] },
    { key: "address", label: "Address", type: "textarea", editableBy: ["admin", "caregiver"] },
    { key: "pin_code", label: "PIN code", type: "text", editableBy: ["admin", "caregiver"] },
    { key: "emergency_contact_name", label: "Emergency contact name", type: "text",
      editableBy: ["admin", "caregiver"] },
    { key: "emergency_contact_phone", label: "Emergency contact phone", type: "tel",
      editableBy: ["admin", "caregiver"] },
  ],
};

const EVERY_ROLE: readonly UserRole[] = [
  "admin", "coordinator", "doctor", "nutritionist",
  "trainer", "psychologist", "caregiver", "member",
];

export const OWN_PROFILE: FieldGroup = {
  name: "Your details",
  fields: [
    { key: "full_name", label: "Full name", type: "text", editableBy: EVERY_ROLE },
    { key: "phone", label: "Phone", type: "tel", editableBy: EVERY_ROLE },
    { key: "whatsapp", label: "WhatsApp", type: "tel", editableBy: EVERY_ROLE },
  ],
};

export const ADMIN_PROFILE: FieldGroup = {
  name: "Profile",
  fields: [
    { key: "full_name", label: "Full name", type: "text", editableBy: ["admin"] },
    { key: "phone", label: "Phone", type: "tel", editableBy: ["admin"] },
    { key: "whatsapp", label: "WhatsApp", type: "tel", editableBy: ["admin"] },
    { key: "specialization", label: "Specialisation", type: "text", editableBy: ["admin"] },
  ],
};

export function canEdit(field: FieldSpec, role: UserRole): boolean {
  return field.editableBy.includes(role);
}

/**
 * The patch the RPC receives: trimmed, only fields this role may edit, and only
 * those whose value actually moved. Dropping unchanged keys is what makes the
 * RPC's `no_changes` mean "you changed nothing" rather than "you resubmitted".
 */
export function buildPatch(
  group: FieldGroup,
  role: UserRole,
  next: Record<string, string>,
  current: Record<string, string | null | undefined>,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const field of group.fields) {
    if (!canEdit(field, role)) continue;
    if (!(field.key in next)) continue;
    const value = (next[field.key] ?? "").trim();
    const before = (current[field.key] ?? "").toString().trim();
    if (value === before) continue;
    patch[field.key] = value;
  }
  return patch;
}
