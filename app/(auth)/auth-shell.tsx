// Shared frame for the signed-out surfaces (/login, /forgot-password,
// /reset-password). It is the first screen anyone sees, so it carries the brand:
// on a wide screen an ink panel where the logo's two leaves come together and a
// growth ring — one ring per 30-day cycle, the product's signature — draws
// itself; on a phone the form comes first and the rings sit behind it as texture.
import Image from "next/image";
import { BrandMark } from "@/components/brand-mark";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Concentric cycle rings with one arc in the brand blend, drawing in on first look. */
function CycleRings({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 200" className={className}>
      <defs>
        <linearGradient id="auth-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--leaf)" />
        </linearGradient>
      </defs>
      {[92, 74, 56, 38].map((r) => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeOpacity="0.09" strokeWidth="1.4" />
      ))}
      {/* Two finished cycles and the current one, two-thirds of the way round.
          The rings are centred on the panel's bottom-right corner, so only their
          upper-left quarter shows; the live arc starts at 9 o'clock to draw
          through that visible quarter first. */}
      <circle cx="100" cy="100" r="38" fill="none" stroke="url(#auth-ring)" strokeWidth="3" />
      <circle cx="100" cy="100" r="56" fill="none" stroke="url(#auth-ring)" strokeWidth="3" />
      <circle
        className="fl-draw"
        cx="100"
        cy="100"
        r="74"
        fill="none"
        stroke="url(#auth-ring)"
        strokeWidth="3"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="0.68 1"
        transform="rotate(180 100 100)"
      />
    </svg>
  );
}

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
    <main className="grid min-h-screen bg-background text-base lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative isolate hidden overflow-hidden bg-foreground text-background lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        {/* The light in the panel: the logo's blue from the top, its green below. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60% 50% at 15% 0%, color-mix(in oklab, var(--primary) 45%, transparent), transparent 70%), radial-gradient(50% 45% at 90% 100%, color-mix(in oklab, var(--leaf) 30%, transparent), transparent 70%)",
          }}
        />
        {/* Centred on the corner: the arcs frame the panel and never cross the text. */}
        <CycleRings className="pointer-events-none absolute -right-[380px] -bottom-[380px] -z-10 size-[760px] text-background" />
        <BrandMark className="h-14 self-start" assemble />
        <div className="fl-rise fl-d2 max-w-md space-y-5">
          <p className="font-display text-5xl leading-[1.05] font-semibold tracking-tight text-balance">
            One care team.
            <br />
            One plan.
          </p>
          <p className="text-lg leading-relaxed text-background/75">
            The doctor, nutritionist, trainer and psychologist work from one plan for each
            member, and every review lands here.
          </p>
        </div>
        <p className="fl-fade fl-d3 text-sm text-background/60">
          Care runs in 30-day cycles. Each ring is one.
        </p>
      </aside>

      <div className="relative isolate flex items-center justify-center overflow-hidden p-4 sm:p-8">
        {/* On a phone the panel is gone; the rings stay as a quiet watermark. */}
        <svg
          aria-hidden
          viewBox="0 0 200 200"
          className="pointer-events-none absolute -z-10 w-[min(140vw,1100px)] text-primary opacity-[0.05] lg:hidden"
        >
          {[92, 74, 56, 38, 20].map((r) => (
            <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth="2.2" />
          ))}
        </svg>
        <Card variant="hero" className="fl-rise w-full max-w-md">
          <CardHeader className="items-center gap-2 text-center lg:items-start lg:text-left">
            <Image
              src="/phloem-logo.png"
              alt="PHLOEM"
              width={180}
              height={60}
              priority
              className="mx-auto mb-2 h-12 w-auto lg:mx-0"
            />
            <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">{subtitle}</p>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
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
      className={`fade-swap mb-4 rounded-lg border p-3 text-foreground ${
        tone === "info" ? "border-info/30 bg-info-tint" : "border-danger/30 bg-danger-tint"
      }`}
    >
      {children}
    </p>
  );
}
