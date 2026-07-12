import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { humanize } from "@/lib/reports/build/helpers";

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
              <li key={m.role} className="flex items-center justify-between py-2.5">
                <span className={big ? "text-lg font-medium" : "font-medium"}>{m.name}</span>
                <span className={big ? "text-base text-muted-foreground" : "text-sm text-muted-foreground"}>
                  {humanize(m.role)}
                  {m.specialization ? ` · ${m.specialization}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
