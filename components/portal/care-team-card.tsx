import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { humanize } from "@/lib/reports/build/helpers";
import { ROLE_CHIP, type UserRole } from "@/lib/roles";

export type CareTeamMember = { role: string; name: string; specialization?: string | null };

// §3 caregiver/member see care-team names + roles only (no contact identifiers).
// Data comes from the get_care_team security-definer RPC.
export function CareTeamCard({ team, big = false }: { team: CareTeamMember[]; big?: boolean }) {
  return (
    <Card>
      <CardHeader className="flex items-center gap-3">
        <span className="icon-well flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary" aria-hidden="true">
          <Users className="size-5" />
        </span>
        <div className="space-y-1">
          <CardTitle className={big ? "text-2xl" : "text-xl"}>Your care team</CardTitle>
          <p className="text-sm text-muted-foreground">The people supporting your journey.</p>
        </div>
      </CardHeader>
      <CardContent>
        {team.length === 0 ? (
          <p className={cn("rounded-2xl border border-dashed bg-muted/30 p-5 leading-relaxed text-muted-foreground", big ? "text-lg" : "text-sm")}>
            Your care team is being assigned. They&apos;ll appear here shortly.
          </p>
        ) : (
          <ul className="space-y-2">
            {team.map((m) => (
              <li key={m.role} className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-4 ring-card",
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
