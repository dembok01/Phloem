"use client";

// T2.3 — shared debounced autosave for form drafts. Extracted from the identical
// effect previously copied into ClinicalForm / FeedbackForm / OnboardingWizard.
// Writes the whole answer set to form_responses.answers (RLS: fr_own_clinical for
// clinicians, fr_cg for the caregiver onboarding draft). Skips the initial mount;
// while `paused` (a locked clinical form) it never writes.
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import type { FormValues } from "./types";

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useAutosaveDraft(
  responseId: string,
  values: FormValues,
  opts: { paused?: boolean; delayMs?: number } = {},
): SaveState {
  const { paused = false, delayMs = 800 } = opts;
  const supabase = React.useMemo(() => createClient(), []);
  const [state, setState] = React.useState<SaveState>("idle");
  const firstRun = React.useRef(true);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    // Don't save the initial answers on mount — only after a real change.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (paused) return;
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await supabase
        .from("form_responses")
        .update({ answers: values as unknown as Json })
        .eq("id", responseId);
      setState(error ? "error" : "saved");
    }, delayMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [values, supabase, responseId, paused, delayMs]);

  return state;
}
