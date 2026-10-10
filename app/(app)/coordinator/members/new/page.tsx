import Link from "next/link";
import { MemberEnrollmentForm } from "@/components/admin/member-enrollment-form";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

// The coordinator enrols a member (§3: "client invites" — create_member_with_invite
// has always accepted the coordinator; only the screen lived in the admin shell).
// Same form and action as /admin/members/new; the links point back into this shell.
export default function CoordinatorNewMemberPage() {
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Enrol a member"
        description="Create the member and a secure caregiver invite link. No email is sent automatically — send the link to the family yourself."
        crumbs={[{ label: "Pipeline", href: "/coordinator/pipeline" }, { label: "Enrol" }]}
        actions={
          <Link href="/coordinator/pipeline" className={cn(buttonVariants({ variant: "outline" }))}>
            Cancel
          </Link>
        }
      />

      <MemberEnrollmentForm links={{ list: "/coordinator/pipeline", invites: null }} />
    </section>
  );
}
