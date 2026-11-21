import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Phone, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeIST } from "@/lib/datetime";

const MODE_LABEL: Record<string, string> = {
  video: "Video call",
  phone: "Phone call",
  in_person: "In person",
};

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
  const upcoming = rows.filter(
    (c) => c.scheduled_at && new Date(c.scheduled_at).getTime() >= now && c.meeting_status !== "cancelled",
  );
  const past = rows
    .filter((c) => !(c.scheduled_at && new Date(c.scheduled_at).getTime() >= now) || c.meeting_status === "cancelled")
    .reverse();

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <PageHeader
        title="Schedule"
        description={`${member.full_name.split(" ")[0]}'s consultations — your coordinator arranges each one.`}
        crumbs={[{ label: "Portal", href: "/portal" }, { label: "Schedule" }]}
      />

      <Section title="Upcoming" rows={upcoming} />
      {past.length > 0 ? <Section title="Past" rows={past} muted /> : null}
    </div>
  );
}

type Row = { id: string; type: string; scheduled_at: string | null; meeting_status: string; mode: string | null };

function Section({ title, rows, muted = false }: { title: string; rows: Row[]; muted?: boolean }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <span className="rounded-full border bg-card px-2.5 py-0.5 font-data text-xs text-muted-foreground">{rows.length}</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing scheduled yet"
          description="When your coordinator books a consultation it appears here, and you'll get a notification too."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => (
            <li
              key={c.id}
              className={`flex flex-wrap items-center gap-4 rounded-2xl border p-5 ${muted ? "bg-muted/35" : "bg-card shadow-card"}`}
            >
              <ModeIcon mode={c.mode} />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-semibold capitalize">{c.type} consultation</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {formatDateTimeIST(c.scheduled_at)}
                  {c.mode ? ` · ${MODE_LABEL[c.mode] ?? c.mode}` : ""}
                </p>
              </div>
              <StatusBadge status={c.meeting_status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ModeIcon({ mode }: { mode: string | null }) {
  const cls = "size-4";
  const icon =
    mode === "phone" ? <Phone className={cls} /> : mode === "in_person" ? <MapPin className={cls} /> : <Video className={cls} />;
  return (
    <span aria-hidden="true" className="icon-well inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
      {icon}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "done") return <Badge variant="success">Completed</Badge>;
  if (status === "scheduled") return <Badge variant="info">Scheduled</Badge>;
  if (status === "cancelled") return <Badge variant="muted">Cancelled</Badge>;
  return <Badge variant="muted">To schedule</Badge>;
}
