import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next, Bricolage_Grotesque } from "next/font/google";
import { NavProgress } from "@/components/nav-progress";
import { FIRST_LOOK_BOOT_SCRIPT } from "@/lib/first-look";
import "./globals.css";

// DESIGN-SYSTEM.md §2 — display / body / data faces.
const display = Bricolage_Grotesque({
  variable: "--font-brand-display",
  subsets: ["latin"],
});

// Atkinson Hyperlegible NEXT (2025): the same Braille Institute low-vision design,
// now a variable font 200–800, so UI labels get real 500/600 weights instead of the
// 400/700 the original offered. Its Mono sibling replaces IBM Plex Mono, so the data
// face shares the body's letterforms (unmistakable 0/O, 1/l/I) — one family.
const body = Atkinson_Hyperlegible_Next({
  variable: "--font-brand-body",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const data = Atkinson_Hyperlegible_Mono({
  variable: "--font-brand-data",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "PHLOEM Care",
    template: "%s · PHLOEM Care",
  },
  description: "Chronic care for your family's elders — one care team, one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the first-look boot script sets data-look/data-boot
    // on <html> before React hydrates (lib/first-look.ts). Only <html> is exempted.
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${data.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: FIRST_LOOK_BOOT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <NavProgress />
        {children}
      </body>
    </html>
  );
}
