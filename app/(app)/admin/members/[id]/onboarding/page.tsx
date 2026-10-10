import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import type { FormSection, FormTemplateSchema } from "@/components/forms/types";
import { AMEND_REFUSED_KEYS } from "@/lib/member-fields";
import { AmendForm } from "./amend-form";

/**
 * Correcting a member's submitted onboarding answers (design §10). The original
 * submission is kept; saving writes a corrected copy, rechecks red flags and
 * reissues the summary as a new version.
 */
export default async function AmendOnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: member }, { data: templates }] = await Promise.all([
    supabase.from("members").select("id, full_name").eq("id", id).maybeSingle(),
    supabase.from("form_templates").select("id, schema").eq("key", "onboarding"),
  ]);
  if (!member) notFound();

  const templateIds = (templates ?? []).map((t) => t.id);
  const { data: response } =
    templateIds.length === 0
      ? { data: null }
      : await supabase
          .from("form_responses")
          .select("answers, submitted_at, template_id")
          .eq("member_id", id)
          .in("template_id", templateIds)
          .not("submitted_at", "is", null)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle();

  const crumbs = [
    { label: "Members", href: "/admin/members" },
    { label: member.full_name, href: `/admin/members/${id}` },
    { label: "Onboarding" },
  ];

  const template = response
    ? ((templates ?? []).find((t) => t.id === response.template_id)?.schema as unknown as FormTemplateSchema | undefined)
    : undefined;

  if (!response || !template) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          crumbs={crumbs}
          title="Nothing to correct yet"
          description="This member has not submitted their onboarding answers."
        />
      </section>
    );
  }

  // Only what an amendment may change. Contacts, demographics and consent are
  // refused by amend_onboarding; offering them would only produce an error.
  const hidden = new Set<string>([...AMEND_REFUSED_KEYS, "consent_info"]);
  const sections: FormSection[] = template.sections
    .map((s) => ({ ...s, fields: s.fields.filter((f) => !hidden.has(f.id)) }))
    .filter((s) => s.fields.length > 0);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        crumbs={crumbs}
        title="Correct the onboarding answers"
        description="The original submission is kept. Saving writes a corrected copy, rechecks the red flags, and issues a new version of the summary. Name, age and contact details are corrected from the member page."
      />
      <AmendForm
        memberId={member.id}
        sections={sections}
        answers={(response.answers ?? {}) as Record<string, unknown>}
      />
    </section>
  );
}
