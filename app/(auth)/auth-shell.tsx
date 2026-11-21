// Shared signed-out frame. The editorial panel gives desktop a welcoming first
// impression; compact screens keep the account task immediately within reach.
import Image from "next/image";
import { CalendarDays, HeartHandshake, Leaf } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background p-4 text-base sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100svh-2rem)] max-w-7xl items-stretch gap-8 sm:min-h-[calc(100svh-3rem)] lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1fr_1.05fr]">
        <aside className="relative isolate hidden flex-col justify-between overflow-hidden rounded-[2rem] bg-[#173d32] p-10 text-white lg:flex xl:p-14">
          <svg
            aria-hidden="true"
            viewBox="0 0 600 600"
            className="pointer-events-none absolute -right-64 top-4 -z-10 size-[740px] text-[#b8cba5] opacity-15"
          >
            {[280, 235, 190, 145, 100, 55].map((r) => (
              <circle key={r} cx="300" cy="300" r={r} fill="none" stroke="currentColor" strokeWidth="1" />
            ))}
          </svg>
          <div className="flex items-center gap-3 text-sm font-medium tracking-[0.16em]">
            <span className="flex size-10 items-center justify-center rounded-full border border-white/20 bg-white/5">
              <Leaf className="size-5" aria-hidden="true" />
            </span>
            CARE THAT GROWS WITH YOU
          </div>
          <div className="my-20 max-w-md space-y-6">
            <p className="font-display text-5xl leading-[1.1] font-medium tracking-tight xl:text-6xl">
              Better care.<br />Every day.
            </p>
            <p className="max-w-sm text-lg leading-relaxed text-white/75">
              A connected team. A thoughtful plan. More confidence in every step of the care journey.
            </p>
          </div>
          <div className="space-y-5 border-t border-white/15 pt-7">
            <div className="flex items-center gap-4">
              <HeartHandshake className="size-5 shrink-0 text-[#c1d4b4]" aria-hidden="true" />
              <p className="text-sm text-white/80">Your family and care team, together.</p>
            </div>
            <div className="flex items-center gap-4">
              <CalendarDays className="size-5 shrink-0 text-[#c1d4b4]" aria-hidden="true" />
              <p className="text-sm text-white/80">Plans, consultations and progress in one place.</p>
            </div>
          </div>
        </aside>

        <div className="flex flex-col items-center justify-center py-6 sm:px-6 lg:py-10">
          <div className="mb-9 w-full max-w-md px-1">
            <Image
              src="/phloem-logo.png"
              alt="PHLOEM"
              width={180}
              height={60}
              priority
              className="h-12 w-auto"
            />
          </div>
          <Card variant="hero" className="w-full max-w-md py-0">
            <CardHeader className="gap-3 px-6 pt-7 sm:px-8 sm:pt-8">
              <p className="eyebrow text-primary">Welcome to your care space</p>
              <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
              <p className="leading-relaxed text-muted-foreground">{subtitle}</p>
            </CardHeader>
            <CardContent className="px-6 pb-7 sm:px-8 sm:pb-8">{children}</CardContent>
          </Card>
          <p className="mt-7 text-center text-sm text-muted-foreground">Thoughtful care. Connected people.</p>
        </div>
      </div>
    </main>
  );
}

/** The one error/notice banner shape these pages share. */
export function AuthNotice({
  id,
  tone = "danger",
  children,
}: {
  id?: string;
  tone?: "danger" | "info";
  children: React.ReactNode;
}) {
  return (
    <p
      id={id}
      role="alert"
      className={`mb-4 rounded-xl border p-4 text-sm leading-relaxed text-foreground ${
        tone === "info" ? "border-info/30 bg-info-tint" : "border-danger/30 bg-danger-tint"
      }`}
    >
      {children}
    </p>
  );
}
