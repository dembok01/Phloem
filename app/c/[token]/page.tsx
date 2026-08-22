import Image from "next/image";
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
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-5 py-10">
      <div className="flex items-center gap-2.5">
        <Image src="/phloem-logo.png" alt="PHLOEM" width={132} height={34} priority className="h-8 w-auto" />
      </div>

      {!link.ok ? (
        <div className="rounded-xl border bg-card p-6 shadow-card">
          <h1 className="font-display text-2xl font-semibold">This link isn&apos;t active</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Check-in links expire after a couple of weeks. Ask your care coordinator to send a fresh
            one — it takes them a moment.
          </p>
        </div>
      ) : link.answered_today ? (
        <div className="rounded-xl border bg-card p-6 shadow-card">
          <h1 className="font-display text-2xl font-semibold">Thank you — we have today&apos;s answers</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            The care team has what you sent. If something changes before they reach out, call your
            coordinator rather than waiting for the next check-in.
          </p>
        </div>
      ) : (
        <>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              How is {link.first_name} doing?
            </h1>
            <p className="mt-1.5 text-lg text-muted-foreground">
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
