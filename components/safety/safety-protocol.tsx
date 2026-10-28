// The trainer's one-page safety card (client item 5), in the client's own words.
// On paper only the card prints — the app around it is hidden.
import { SAFETY_PROTOCOL } from "@/lib/safety";
import { PrintButton } from "./print-button";

const PRINT_ONLY_THE_CARD = `@media print {
  @page { size: A4; margin: 16mm; }
  body * { visibility: hidden; }
  #safety-card, #safety-card * { visibility: visible; }
  #safety-card { position: absolute; inset: 0 auto auto 0; width: 100%; }
}`;

export function SafetyProtocol() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <style>{PRINT_ONLY_THE_CARD}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">Print it and keep it beside you during every session.</p>
        <PrintButton />
      </div>
      <article
        id="safety-card"
        className="space-y-6 rounded-2xl border bg-card p-6 shadow-card print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-8"
      >
        <header className="space-y-1">
          <p className="eyebrow">PHLOEM · for trainers</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Safety card</h1>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Before the session</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-base">
            {SAFETY_PROTOCOL.before.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-2 rounded-xl border-2 border-danger/50 p-4">
          <h2 className="text-lg font-semibold text-danger">If something happens</h2>
          <ol className="list-decimal space-y-1.5 pl-6 text-lg font-medium">
            {SAFETY_PROTOCOL.during.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">After</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-base">
            {SAFETY_PROTOCOL.after.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <p className="border-t pt-4 text-sm text-muted-foreground">
          Each client&apos;s nearby contact, hospital and ambulance numbers are on the Emergency card at the top of
          their page. Outside India, call the ambulance number shown there instead of 108. Log a day with no session
          and any incident from that card.
        </p>
      </article>
    </div>
  );
}
