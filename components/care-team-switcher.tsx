import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getLens, LENS_ROLES, serializeLens, type LensRole } from "@/lib/lens";
import { ROLE_LABEL } from "@/lib/roles";
import { CareTeamSwitcherMenu, type DeskOption } from "./care-team-switcher-menu";

const GROUP: Record<LensRole, string> = {
  doctor: "Doctors",
  nutritionist: "Nutritionists",
  trainer: "Trainers",
};

/**
 * Admin-only desk picker (renders nothing for everyone else).
 *
 * The care-team list comes from `profiles` under `prof_admin` — the same policy
 * that already lets /admin/care-team render. No new read.
 */
export async function CareTeamSwitcher() {
  const profile = await getSessionProfile();
  if (profile?.role !== "admin") return null;

  const lens = await getLens();
  const supabase = await createClient();
  const { data: team } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("role", [...LENS_ROLES])
    .eq("status", "active")
    .order("full_name");

  const options: DeskOption[] = [
    { lens: "", to: "/admin", label: "Admin desk", role: "admin", group: "My desk" },
    {
      lens: "",
      to: "/coordinator",
      label: "Coordinator desk",
      role: "coordinator",
      group: "My desk",
    },
  ];

  for (const role of LENS_ROLES) {
    const people = (team ?? []).filter((p) => p.role === role);
    if (people.length === 0) continue;
    options.push({
      lens: serializeLens({ role, userId: null }),
      to: "/clinician/clients",
      label: `All ${GROUP[role].toLowerCase()}`,
      role,
      group: GROUP[role],
    });
    for (const p of people) {
      options.push({
        lens: serializeLens({ role, userId: p.id }),
        to: "/clinician/clients",
        label: p.full_name,
        role,
        group: GROUP[role],
      });
    }
  }

  return (
    <CareTeamSwitcherMenu options={options} current={lens ? serializeLens(lens) : ""} />
  );
}

/** Label for the "viewing as" banner, e.g. "Dr. Rajesh · Doctor". */
export async function lensLabel(): Promise<string | null> {
  const lens = await getLens();
  if (!lens) return null;
  if (!lens.userId) return `All ${GROUP[lens.role].toLowerCase()}`;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", lens.userId)
    .maybeSingle();
  return data?.full_name ?? ROLE_LABEL[lens.role];
}
