// W3 — how engaged a family is, on screen.
//
// Vocabulary matters here more than usual. `member_status.inactive` already means
// "the package finished", which is a GOOD outcome; a family that has stopped
// engaging is "quiet" or "needs a call". Using "inactive" for both would make the
// pipeline board unreadable.
//
// The tone ladder is Moss → Honey → Clay, and each state carries an icon and words,
// never colour alone (DESIGN-SYSTEM §5).
import { AlertTriangle, CircleDot, PhoneCall } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type EngagementRow = {
  member_id: string;
  full_name?: string;
  last_activity_at: string | null;
  days_quiet: number;
  missed_consults: number;
  state: string;
  reason: string;
};

const META: Record<
  string,
  { label: string; variant: "muted" | "warning" | "danger"; icon: typeof CircleDot }
> = {
  engaged: { label: "Engaged", variant: "muted", icon: CircleDot },
  quiet: { label: "Quiet", variant: "warning", icon: PhoneCall },
  at_risk: { label: "Needs a call", variant: "danger", icon: AlertTriangle },
};

export function EngagementBadge({ state, reason }: { state: string; reason?: string }) {
  const meta = META[state] ?? META.engaged;
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} title={reason}>
      <Icon className="size-3.5" aria-hidden /> {meta.label}
    </Badge>
  );
}

/** The one-line explanation. Always shown beside the badge — "Quiet" alone tells a
 *  coordinator nothing they can act on. */
export function EngagementReason({ reason }: { reason: string }) {
  return <span className="text-sm text-muted-foreground">{reason}</span>;
}
