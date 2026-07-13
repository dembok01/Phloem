import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { VideoGate } from "@/components/forms/VideoGate";
import { OnboardingWizard } from "@/components/forms/OnboardingWizard";
import type { FormTemplateSchema, FormValues } from "@/components/forms/types";

// member_status values at or beyond a completed questionnaire.
const DONE_STATUSES = new Set([
  "onboarded",
  "assigned",
  "initial_consults",
  "ready_to_start",
  "active",
  "renewal_due",
  "inactive",
]);

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  const supabase = await createClient();

  // RLS (mem_caregiver) returns the row only to the member's caregiver.
  const { data: member } = await supabase
    .from("members")
    .select("id, full_name, status, onboarding_video_watched_at")
    .eq("id", memberId)
    .maybeSingle();
  if (!member) redirect("/portal");

  if (DONE_STATUSES.has(member.status)) {
    return (
      <section className="mx-auto max-w-2xl space-y-4 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600 dark:text-emerald-400" />
        <h1 className="text-2xl font-semibold">Onboarding complete</h1>
        <p className="text-base text-muted-foreground">
          Thank you — {member.full_name}&apos;s onboarding is complete. Your care coordinator will
          review the answers and assign a care team.
        </p>
        <Link href="/portal" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-5")}>
          Back to portal
        </Link>
      </section>
    );
  }

  // Video gate first (§6 mark_video_watched advances signed_up → onboarding).
  if (!member.onboarding_video_watched_at) {
    const videoUrl =
      process.env.ONBOARDING_VIDEO_URL_CLIENT ?? "https://www.youtube.com/watch?v=placeholder";
    return <VideoGate memberId={member.id} videoUrl={videoUrl} />;
  }

  // Load the active onboarding template.
  const { data: template } = await supabase
    .from("form_templates")
    .select("id, schema")
    .eq("key", "onboarding")
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!template) redirect("/portal");
  const schema = template.schema as unknown as FormTemplateSchema;

  // Ensure a single draft response exists; resume from its answers.
  const { data: existing } = await supabase
    .from("form_responses")
    .select("id, answers")
    .eq("member_id", member.id)
    .eq("template_id", template.id)
    .is("submitted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let responseId = existing?.id ?? null;
  let initialAnswers: FormValues = (existing?.answers as unknown as FormValues | null) ?? {};

  if (!responseId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    initialAnswers = await prefillAnswers(supabase, member.id, member.full_name);
    const { data: created, error } = await supabase
      .from("form_responses")
      .insert({
        member_id: member.id,
        template_id: template.id,
        respondent_id: user?.id ?? null,
        answers: initialAnswers as unknown as Json,
      })
      .select("id")
      .single();
    if (error || !created) redirect("/portal");
    responseId = created.id;
  }

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-2xl">
        <p className="eyebrow">Onboarding</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {member.full_name}
        </h1>
      </div>
      <OnboardingWizard
        template={schema}
        memberId={member.id}
        memberName={member.full_name}
        responseId={responseId}
        initialAnswers={initialAnswers}
      />
    </div>
  );
}

/** Seed the draft with what enrollment already captured, to save re-typing. */
async function prefillAnswers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  memberId: string,
  fullName: string,
): Promise<FormValues> {
  const answers: FormValues = { full_name: fullName };

  const { data: m } = await supabase
    .from("members")
    .select("age, gender, occupation, city, country, language, relationship_to_caregiver")
    .eq("id", memberId)
    .maybeSingle();
  if (m) {
    if (m.age != null) answers.age = m.age;
    for (const k of ["gender", "occupation", "city", "country", "language", "relationship_to_caregiver"] as const) {
      if (m[k]) answers[k] = m[k];
    }
  }

  // Contacts (caregiver reads their own via con_caregiver). These are stripped
  // back out into member_contacts by submit_onboarding's §4 data-split.
  const { data: c } = await supabase
    .from("member_contacts")
    .select("phone, pin_code, emergency_contact_name, emergency_contact_phone")
    .eq("member_id", memberId)
    .maybeSingle();
  if (c) {
    if (c.phone) answers.contact_number = c.phone;
    if (c.pin_code) answers.pin_code = c.pin_code;
    if (c.emergency_contact_name) answers.emergency_contact_name = c.emergency_contact_name;
    if (c.emergency_contact_phone) answers.emergency_contact_phone = c.emergency_contact_phone;
  }

  return answers;
}
