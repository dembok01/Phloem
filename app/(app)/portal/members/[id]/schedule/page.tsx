import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeIST } from "@/lib/datetime";

// §10 caregiver/elderly "Schedule" — the member's consultations (RLS: cons_caregiver
// / cons_member). Upcoming first, then past.
export default async function PortalSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase.from("members").select("id, full_name").eq("id", id).maybeSingle();
  if (!member) notFound();

  const { data: consults } = await supabase
    .from("consultations")
    .select("id, type, scheduled_at, meeting_status, mode")
    .eq("member_id", id)
    .not("scheduled_at", "is", null)
    .order("scheduled_at", { ascending: true });

  const now = Date.now();
  const rows = consults ?? [];
  const upcoming = rows.filter((c) => c.scheduled_at && new Date(c.scheduled_at).getTime() >= now && c.meeting_status !== "cancelled");
  const past = rows.filter((c) => !(c.scheduled_at && new Date(c.scheduled_at).getTime() >= now) || c.meeting_status === "cancelled");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/portal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Portal
      </Link>
      <h1 className="text-2xl font-semibold">{member.full_name} — Schedule</h1>

      <Section title="Upcoming" rows={upcoming} empty="No upcoming consultations scheduled." />
      {past.length > 0 ? <Section title="Past" rows={past} empty="" muted /> : null}
    </div>
  );
}

function Section({
  title,
  rows,
  empty,
  muted = false,
}: {
  title: string;
  rows: { id: string; type: string; scheduled_at: string | null; meeting_status: string; mode: string | null }[];
  empty: string;
  muted?: boolean;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-medium">{title}</h2>
      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">{empty}</CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li
              key={c.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-4 ${muted ? "opacity-70" : ""}`}
            >
              <div>
                <p className="text-base font-medium capitalize">{c.type} consultation</p>
                <p className="text-sm text-muted-foreground">
                  {formatDateTimeIST(c.scheduled_at)}
                  {c.mode ? ` · ${c.mode.replace("_", " ")}` : ""}
                </p>
              </div>
              <StatusBadge status={c.meeting_status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "done") return <Badge variant="success">Completed</Badge>;
  if (status === "scheduled") return <Badge variant="default">Scheduled</Badge>;
  if (status === "cancelled") return <Badge variant="muted">Cancelled</Badge>;
  return <Badge variant="muted">To schedule</Badge>;
}
