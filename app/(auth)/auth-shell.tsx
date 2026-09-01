// Shared frame for the signed-out surfaces (/login, /forgot-password,
// /reset-password). V4 — the first impression: a bare box on a flat ground was
// replaced by the product's own signature mark, at a size where the rings read
// as ground texture rather than decoration.
import Image from "next/image";
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
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 text-base">
      <svg
        aria-hidden
        viewBox="0 0 200 200"
        className="pointer-events-none absolute -z-10 w-[min(140vw,1100px)] text-primary opacity-[0.045]"
      >
        {[92, 74, 56, 38, 20].map((r) => (
          <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth="2.2" />
        ))}
      </svg>
      <Card variant="hero" className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Image
            src="/phloem-logo.png"
            alt="PHLOEM"
            width={180}
            height={60}
            priority
            className="mx-auto h-14 w-auto"
          />
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
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
      className={`mb-4 rounded-md border p-3 text-foreground ${
        tone === "info" ? "border-info/30 bg-info-tint" : "border-danger/30 bg-danger-tint"
      }`}
    >
      {children}
    </p>
  );
}
