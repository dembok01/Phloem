// W5 — the issue strip. What is wrong with this member, in the order it matters.
//
// Each chip is icon + tint + words, never colour alone (DESIGN-SYSTEM §5), and the
// tones are the existing semantics: Clay for danger (a decision or an adverse
// event), Honey for warning, muted for information. Nothing new is introduced —
// a doctor should not have to learn a second colour vocabulary for this strip.
import {
  AlertTriangle,
  CalendarClock,
  FileWarning,
  MessageSquare,
  PhoneOff,
  ShieldAlert,
  TrendingDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Issue, IssueKind } from "@/lib/issues";

const ICON: Record<IssueKind, typeof AlertTriangle> = {
  clearance: ShieldAlert,
  adverse_event: AlertTriangle,
  report_overdue: FileWarning,
  measure_decline: TrendingDown,
  family_at_risk: PhoneOff,
  programme_ending: CalendarClock,
  unread_messages: MessageSquare,
};

const VARIANT = {
  danger: "danger",
  warning: "warning",
  info: "muted",
} as const;

export function IssueChips({
  issues,
  className,
  showDetail = false,
}: {
  issues: Issue[];
  className?: string;
  /** the member page has room for the "why"; a list row does not */
  showDetail?: boolean;
}) {
  if (issues.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {issues.map((issue) => {
        const Icon = ICON[issue.kind];
        return (
          <li key={issue.kind}>
            <Badge variant={VARIANT[issue.severity]} title={issue.detail}>
              <Icon className="size-3.5 shrink-0" aria-hidden />
              {issue.label}
              {showDetail && issue.detail ? (
                <span className="font-normal opacity-80"> — {issue.detail}</span>
              ) : null}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
