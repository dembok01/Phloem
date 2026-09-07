import Link from "next/link";
import { MemberEnrollmentForm } from "@/components/admin/member-enrollment-form";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

export default function NewMemberPage() {
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Enroll a member"
        description="Create the member and a secure caregiver invite link. No email is sent automatically."
        crumbs={[{ label: "Members", href: "/admin/members" }, { label: "Enroll" }]}
        actions={
          <Link href="/admin/members" className={cn(buttonVariants({ variant: "outline" }))}>
            Cancel
          </Link>
        }
      />

      <MemberEnrollmentForm />
    </section>
  );
}
