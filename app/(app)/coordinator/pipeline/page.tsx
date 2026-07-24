import { PageHeader } from "@/components/page-header";
import { PipelineBoard, type PipelineCard } from "@/components/coordinator/pipeline-board";
import { createClient } from "@/lib/supabase/server";
import { hasHighFlag, parseRedFlags } from "@/lib/red-flags";
import { PIPELINE_COLUMNS, type MemberStatus } from "@/lib/member-status";

// §10 pipeline board: members grouped into member_status columns; cards show
// name, red-flag dot, and the next action. Cards drag between columns (P-2) —
// dropping a ready member on Active starts the program; other stage moves are
// side-effect-heavy §6 transitions and hand off to the member page.
export default async function CoordinatorPipelinePage() {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("members")
    .select("id, full_name, status, red_flags")
    .order("created_at", { ascending: true });

  const list = members ?? [];
  const ids = list.map((m) => m.id);

  // Submitted-report counts for the Initial Consults chip (N/4).
  const submittedByMember = new Map<string, number>();
  if (ids.length > 0) {
    const { data: consults } = await supabase
      .from("consultations")
      .select("member_id, report_status")
      .is("cycle_id", null)
      .in("member_id", ids);
    for (const c of consults ?? []) {
      if (c.report_status === "submitted") {
        submittedByMember.set(c.member_id, (submittedByMember.get(c.member_id) ?? 0) + 1);
      }
    }
  }

  function nextAction(status: MemberStatus, memberId: string): string {
    switch (status) {
      case "invited":
      case "signed_up":
        return "Awaiting onboarding";
      case "onboarding":
        return "Onboarding in progress";
      case "onboarded":
        return "Assign the care team";
      case "assigned":
      case "initial_consults":
        return `${submittedByMember.get(memberId) ?? 0}/4 reports in`;
      case "ready_to_start":
        return "Ready — drag to Active to start";
      case "active":
        return "Program running";
      case "renewal_due":
        return "Renewal conversation";
      case "inactive":
        return "Program complete";
    }
  }

  const cards: PipelineCard[] = list.map((m) => {
    const flags = parseRedFlags(m.red_flags);
    return {
      id: m.id,
      full_name: m.full_name,
      status: m.status as MemberStatus,
      high: hasHighFlag(flags),
      hasFlags: flags.length > 0,
      nextAction: nextAction(m.status as MemberStatus, m.id),
    };
  });

  return (
    <section className="space-y-6">
      <PageHeader
        title="Pipeline"
        description="Every member by stage — drag a card forward, or open one to schedule, assign, or start."
      />

      <PipelineBoard columns={PIPELINE_COLUMNS} cards={cards} />

      <p className="font-data text-xs text-muted-foreground">
        Tip: drag a ready member onto <span className="font-medium">Active</span> to start their program, or
        press <kbd className="rounded border bg-muted px-1">⌘K</kbd> to jump to a member.
      </p>
    </section>
  );
}
