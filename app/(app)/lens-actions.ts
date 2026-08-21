"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionProfile } from "@/lib/auth";
import { LENS_COOKIE, parseLens, serializeLens } from "@/lib/lens";

/**
 * Point the admin at another desk (or back at their own).
 *
 * `lens` is "" to clear, or the `role[:uuid]` shape parseLens() accepts. The
 * cookie only survives the round trip if the DATABASE says this caller is an
 * admin; getLens() re-checks on every read, so the cookie is a preference, not
 * a credential.
 */
const schema = z.object({
  lens: z.string().max(64),
  to: z.enum(["/admin", "/coordinator", "/clinician/clients"]),
});

export async function setLens(formData: FormData) {
  const parsed = schema.safeParse({
    lens: String(formData.get("lens") ?? ""),
    to: String(formData.get("to") ?? "/admin"),
  });
  if (!parsed.success) redirect("/admin");

  const profile = await getSessionProfile();
  if (profile?.role !== "admin") redirect(profile ? "/" : "/login");

  const store = await cookies();
  if (parsed.data.lens === "") {
    store.delete(LENS_COOKIE);
  } else {
    const lens = parseLens(parsed.data.lens);
    if (!lens) redirect("/admin");
    store.set(LENS_COOKIE, serializeLens(lens), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8, // one working day; the lens should not outlive a shift
    });
  }

  redirect(parsed.data.to);
}
