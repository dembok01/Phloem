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
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <Check className="size-5 shrink-0 text-success" aria-hidden />
          <p className="text-lg">
            You&apos;ve asked to continue {memberFirstName}&apos;s care. Your coordinator will call
            to arrange the next programme.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (status === "declined") {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <MessageCircle className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-lg text-muted-foreground">
            Your coordinator will call to talk through what happens next.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      variant="hero"
      className="border-warning/30 bg-gradient-to-br from-warning-tint/70 via-card to-card"
    >
      <CardContent className="space-y-4 py-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-tint text-warning">
            <CalendarHeart className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">
              {memberFirstName}&apos;s programme is ending{endsOn ? ` on ${endsOn}` : " soon"}
            </h2>
            <p className="mt-1 text-lg text-muted-foreground">
              Another {months} months keeps the same care team, the monthly consultations, and the
              plans that are working. Nothing is charged here — your coordinator will talk you
              through it.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
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
