import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { humanize } from "@/lib/reports/build/helpers";
import { ROLE_CHIP, type UserRole } from "@/lib/roles";

export type CareTeamMember = { role: string; name: string; specialization?: string | null };

// §3 caregiver/member see care-team names + roles only (no contact identifiers).
// Data comes from the get_care_team security-definer RPC.
export function CareTeamCard({ team, big = false }: { team: CareTeamMember[]; big?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={big ? "text-xl" : undefined}>Your care team</CardTitle>
      </CardHeader>
      <CardContent>
        {team.length === 0 ? (
          <p className={big ? "text-lg text-muted-foreground" : "text-muted-foreground"}>
            Your care team is being assigned. They&apos;ll appear here shortly.
          </p>
        ) : (
          <ul className="divide-y">
            {team.map((m) => (
              <li key={m.role} className="flex items-center gap-3 py-3">
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    ROLE_CHIP[m.role as UserRole] ?? "bg-secondary text-secondary-foreground",
                  )}
                >
                  {m.name
                    .split(/\s+/)
                    .filter((w) => w && !/^dr\.?$/i.test(w))
                    .slice(0, 2)
                    .map((w) => w[0]!.toUpperCase())
                    .join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={big ? "text-lg font-medium" : "font-medium"}>{m.name}</p>
                  <p className={big ? "text-base text-muted-foreground" : "text-sm text-muted-foreground"}>
                    {humanize(m.role)}
                    {m.specialization ? ` · ${m.specialization}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
