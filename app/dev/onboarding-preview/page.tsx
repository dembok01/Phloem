import type { Metadata } from "next";
import { notFound } from "next/navigation";
import onboardingTemplate from "@/supabase/templates/onboarding.v1.json";
import { OnboardingWizard } from "@/components/forms/OnboardingWizard";
import { parseFormTemplate } from "@/components/forms/schema";
import type { FormValues } from "@/components/forms/types";

export const metadata: Metadata = { title: "Onboarding preview" };

// The onboarding questionnaire over the checked-in template with synthetic
// answers, so it can be seen and checked without a real member in onboarding
// (the hosted project has none). The wizard runs in preview mode: autosave is
// paused and Send is a no-op, so it reads nothing from and writes nothing to
// the database, and shows no real person.
//
// Local dev and Vercel *preview* deployments only (the owner checks each phase
// on a preview); production gets a 404. Still behind the login middleware.
// When the onboarding template is versioned, point the import at the new file.
const ENABLED = process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";

const NAME = "Leela (sample)";

// What enrolment would have prefilled, so the "confirm the basics" card shows its
// summary state. Every value is invented.
const SAMPLE: FormValues = {
  full_name: NAME,
  age: 72,
  gender: "Female",
  relationship_to_caregiver: "Mother",
  occupation: "Retired teacher",
  city: "Kochi",
  country: "India",
  language: "Malayalam",
  contact_number: "+91 90000 00000",
};

export default function OnboardingPreviewPage() {
  if (!ENABLED) notFound();
  const template = parseFormTemplate(onboardingTemplate);

  return (
    <main className="space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <p className="eyebrow">Onboarding preview · sample answers · nothing is saved</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{NAME}</h1>
      </div>
      <OnboardingWizard
        template={template}
        memberId="preview"
        memberName={NAME}
        responseId="preview"
        initialAnswers={SAMPLE}
        preview
      />
    </main>
  );
}
