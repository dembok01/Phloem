import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ThreadPanel } from "@/components/threads/thread-panel";
import { createClient } from "@/lib/supabase/server";

// W2 — the family's side of the conversation. RLS shows only `family` threads for
// this member, so the internal care-team notes about them are structurally absent
// rather than filtered here.
//
// The elderly (`member`) login reaches this page too, and the same rule applies —
// but the portal only links it for caregivers, keeping that surface at the three
// items §10 caps it to.
export default async function PortalMessagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("members")
    .select("id, full_name")
    .eq("id", id)
    .maybeSingle();
  if (!member) notFound();

  const firstName = member.full_name.split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        crumbs={[{ label: "Home", href: "/portal" }, { label: "Messages" }]}
        title="Messages"
        description={`Ask the care team anything about ${firstName}'s care. They reply here, and you'll get a notification when they do.`}
      />
      <ThreadPanel
        memberId={id}
        memberFirstName={firstName}
        compose="family"
        title="Your conversations"
      />
    </div>
  );
}
