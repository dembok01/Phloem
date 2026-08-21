import { cache } from "react";
import { cookies } from "next/headers";
import { getSessionProfile } from "@/lib/auth";
import { LENS_COOKIE, parseLens, type Lens } from "@/lib/lens-core";

/**
 * The admin lens — how an admin stands at another care-team member's desk.
 *
 * Presentation only, in the same sense as lib/permissions.ts: it picks which
 * shell to render and whose caseload to filter to. It grants nothing. Every row
 * an admin sees through a lens is a row `mem_admin` / `rep_admin` / `case_admin`
 * (etc.) already hands them, and every write still goes through the §6 RPCs,
 * which do not know this file exists.
 *
 * Coordinator needs no lens: those pages never branch on role, so an admin
 * simply walks into /coordinator and it works.
 */

export {
  LENS_COOKIE,
  LENS_ROLES,
  parseLens,
  serializeLens,
  viewRoleFor,
  type Lens,
  type LensRole,
} from "@/lib/lens-core";

/**
 * The active lens, or null. Request-cached alongside getSessionProfile() so the
 * layout and the page it renders share one resolution.
 *
 * Returns null for every non-admin, whatever the cookie says — the cookie is a
 * preference, and the database is the one that decides who is an admin.
 */
export const getLens = cache(async (): Promise<Lens | null> => {
  const profile = await getSessionProfile();
  if (profile?.role !== "admin") return null;
  const store = await cookies();
  return parseLens(store.get(LENS_COOKIE)?.value);
});
