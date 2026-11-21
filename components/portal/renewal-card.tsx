"use client";

// W4 — the renewal offer, as the family sees it.
//
// This is a money-adjacent moment in a product about an ageing parent, so the tone
// does the heavy lifting: it says what continues, not what it costs (payments are
// handled off-platform by decision), and it offers a way to say "not yet" that
// isn't a rejection. "Let's talk first" reaches the same coordinator as "yes".
//
// It appears above the fold only while an offer is open; once answered it collapses
// to a quiet line, because a settled decision should stop asking.
import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarHeart, Check, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { respondToRenewal } from "@/app/(app)/portal/actions";

export function RenewalCard({
  renewalId,
  memberFirstName,
  months,
  status,
  endsOn,
}: {
  renewalId: string;
  memberFirstName: string;
  months: number;
  status: string;
  endsOn: string | null;
}) {
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function answer(intent: "interested" | "declined") {
    startTransition(async () => {
      const res = await respondToRenewal({ renewal_id: renewalId, intent });
      if (res.ok) {
        toast(
          "success",
          intent === "interested"
            ? "Thank you — your coordinator will be in touch"
            : "Noted — your coordinator will call to talk it through",
        );
        router.refresh();
      } else {
        toast("error", res.error);
      }
    });
  }

  if (status === "interested") {
    return (
      <Card className="border-success/25 bg-success-tint/40 py-0">
        <CardContent className="flex items-center gap-4 py-5">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-success-tint">
            <Check className="size-5 text-success" aria-hidden />
          </span>
          <p className="text-base leading-relaxed">
            You&apos;ve asked to continue {memberFirstName}&apos;s care. Your coordinator will call
            to arrange the next programme.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (status === "declined") {
    return (
      <Card className="py-0">
        <CardContent className="flex items-center gap-4 py-5">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
            <MessageCircle className="size-5 text-primary" aria-hidden />
          </span>
          <p className="text-base leading-relaxed text-muted-foreground">
            Your coordinator will call to talk through what happens next.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      variant="hero"
      className="overflow-hidden border-warning/30 bg-gradient-to-br from-warning-tint/70 via-card to-card py-0"
    >
      <CardContent className="space-y-5 py-6 sm:p-7">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <span className="mt-0.5 inline-flex size-12 shrink-0 items-center justify-center rounded-2xl border border-warning/15 bg-warning-tint text-warning">
            <CalendarHeart className="size-6" aria-hidden />
          </span>
          <div>
            <p className="eyebrow mb-2 text-warning">The next chapter</p>
            <h2 className="font-display text-xl font-semibold sm:text-2xl">
              {memberFirstName}&apos;s programme is ending{endsOn ? ` on ${endsOn}` : " soon"}
            </h2>
            <p className="mt-2 max-w-3xl text-base leading-relaxed text-muted-foreground">
              Another {months} months keeps the same care team, the monthly consultations, and the
              plans that are working. Nothing is charged here — your coordinator will talk you
              through it.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-warning/15 pt-5">
          <Button size="lg" loading={pending} disabled={pending} onClick={() => answer("interested")}>
            I&apos;d like to continue
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={pending}
            onClick={() => answer("declined")}
          >
            Let&apos;s talk first
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
