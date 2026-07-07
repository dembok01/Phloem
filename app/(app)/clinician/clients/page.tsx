import Link from "next/link";
import { ChevronRight, FileWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeIST } from "@/lib/datetime";
import { hasHighFlag, parseRedFlags } from "@/lib/red-flags";

// §10 clinician clients list — assigned members only (mem_clinician RLS), with a
// pending-form badge, next own-type consult, and a red-flag dot.
export default async function ClinicianClientsPage() {
  const supabase = await createClient();

  const [{ data: members }, { data: consults }] = await Promise.all([
    supabase.from("members").select("id, full_name, age, status, red_flags").order("full_name"),
    // cons_clinician already scopes these to the viewer's own type + assigned members.
    supabase.from("consultations").select("member_id, meeting_status, report_status, scheduled_at"),
  ]);

  const pending = new Map<string, boolean>();
  const nextConsult = new Map<string, string>();
  const now = Date.now();
  for (const c of consults ?? []) {
    if (c.meeting_status === "done" && c.report_status === "pending") pending.set(c.member_id, true);
    if (c.scheduled_at && new Date(c.scheduled_at).getTime() >= now) {
      const cur = nextConsult.get(c.member_id);
      if (!cur || new Date(c.scheduled_at) < new Date(cur)) nextConsult.set(c.member_id, c.scheduled_at);
    }
  }

  const list = members ?? [];

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Clients</h1>
        <p className="text-sm text-muted-foreground">Members assigned to you.</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl bg-card p-10 text-center text-muted-foreground ring-1 ring-foreground/10">
          <p>No clients yet — the coordinator assigns members to you.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => {
            const flags = parseRedFlags(m.red_flags);
            const next = nextConsult.get(m.id);
            return (
              <li key={m.id}>
                <Link
                  href={`/clinician/clients/${m.id}`}
                  className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-muted"
                >
                  {hasHighFlag(flags) ? (
                    <span className="size-2.5 shrink-0 rounded-full bg-destructive" title="High red flag" />
                  ) : flags.length > 0 ? (
                    <span className="size-2.5 shrink-0 rounded-full bg-amber-500" title="Red flag" />
                  ) : (
                    <span className="size-2.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {m.full_name}
                      {m.age ? <span className="text-muted-foreground"> · {m.age} yrs</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {next ? `Next consult: ${formatDateTimeIST(next)}` : "No upcoming consult"}
                    </p>
                  </div>
                  {pending.get(m.id) ? (
                    <Badge variant="warning">
                      <FileWarning className="size-3.5" /> Form due
                    </Badge>
                  ) : null}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
