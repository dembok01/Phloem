import Image from "next/image";
import { Check, HeartHandshake, Link2Off } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CheckinForm } from "./checkin-form";

// W3.2 — the family check-in, reachable with no login.
//
// This page renders a FIRST NAME and five questions. That is the entire payload:
// no conditions, no plan, no schedule, no contact details. A check-in link gets
// forwarded, screenshotted and left open on shared phones, so it is designed to be
// worthless to anyone who is not the family.
//
// Every failure — bad token, expired, revoked, over its use cap — renders the same
// page, so the URL cannot be used to find out which tokens exist.
export const dynamic = "force-dynamic";

export default async function CheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_checkin_link", { p_token: token });
  const link = (data ?? {}) as { ok?: boolean; first_name?: string; answered_today?: boolean };

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-7 px-5 py-10 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-6">
        <Image src="/phloem-logo.png" alt="PHLOEM" width={132} height={34} priority className="h-8 w-auto" />
        <span className="eyebrow text-primary">Family check-in</span>
      </div>

      {!link.ok ? (
        <div className="rounded-3xl border bg-card p-6 shadow-card sm:p-8">
          <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Link2Off className="size-6" aria-hidden="true" />
          </span>
          <h1 className="font-display text-2xl font-semibold">This link isn&apos;t active</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Check-in links expire after a couple of weeks. Ask your care coordinator to send a fresh
            one — it takes them a moment.
          </p>
        </div>
      ) : link.answered_today ? (
        <div className="dashboard-hero rounded-3xl border bg-card p-6 shadow-card sm:p-8">
          <span className="mb-5 flex size-12 items-center justify-center rounded-full bg-success-tint text-success">
            <Check className="size-6" aria-hidden="true" />
          </span>
          <h1 className="font-display text-2xl font-semibold">Thank you — we have today&apos;s answers</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            The care team has what you sent. If something changes before they reach out, call your
            coordinator rather than waiting for the next check-in.
          </p>
        </div>
      ) : (
        <>
          <div className="dashboard-hero rounded-3xl border p-6 sm:p-8">
            <span className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-primary/10 bg-card/80 text-primary">
              <HeartHandshake className="size-6" aria-hidden="true" />
            </span>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              How is {link.first_name} doing?
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Five quick questions. The care team reads every answer — it takes about a minute, and
              you don&apos;t need to sign in.
            </p>
          </div>
          <CheckinForm token={token} firstName={link.first_name ?? "your parent"} />
        </>
      )}

      <p className="text-center text-sm text-muted-foreground">
        PHLOEM · If something is urgent, call your care coordinator or your local emergency number.
      </p>
    </main>
  );
}
