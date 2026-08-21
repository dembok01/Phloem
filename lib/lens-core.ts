// Pure half of the admin lens (lib/lens.ts holds the server-only getLens()).
// Split out so the cookie parser — the part that decides what a forged value is
// allowed to mean — can be unit-tested without pulling in next/headers.
import type { UserRole } from "@/lib/roles";

export const LENS_COOKIE = "phloem_lens";

/** The clinical shells an admin may borrow. Psychologist is deliberately absent:
 * the wellbeing surface stays with the psychologist and /admin. */
export const LENS_ROLES = ["doctor", "nutritionist", "trainer"] as const;
export type LensRole = (typeof LENS_ROLES)[number];

export type Lens = {
  /** Which shell to render. */
  role: LensRole;
  /** Whose caseload to show — null means "everyone this role looks after". */
  userId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isLensRole(v: string): v is LensRole {
  return (LENS_ROLES as readonly string[]).includes(v);
}

/** Cookie value is `role` or `role:uuid` — small enough to read in a log line. */
export function serializeLens(lens: Lens): string {
  return lens.userId ? `${lens.role}:${lens.userId}` : lens.role;
}

/**
 * Parse a cookie value into a lens, or null.
 *
 * Rejects anything that is not one of LENS_ROLES — notably 'admin',
 * 'coordinator' and 'psychologist' — and any userId that is not a UUID, so a
 * hand-edited cookie cannot name a shell or a shape the picker never offered.
 * This is defence in depth, not the boundary: RLS decides what any of it reads.
 */
export function parseLens(raw: string | undefined): Lens | null {
  if (!raw) return null;
  const parts = raw.split(":");
  if (parts.length > 2) return null;
  const [role, userId] = parts;
  if (!isLensRole(role)) return null;
  if (userId !== undefined && !UUID.test(userId)) return null;
  return { role, userId: userId ?? null };
}

/** Which role's shell this request should render as. */
export function viewRoleFor(role: UserRole, lens: Lens | null): UserRole {
  return role === "admin" && lens ? lens.role : role;
}
