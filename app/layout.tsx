import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// DESIGN-SYSTEM.md §2 — display / body / data faces.
const display = Bricolage_Grotesque({
  variable: "--font-brand-display",
  subsets: ["latin"],
});

const body = Atkinson_Hyperlegible({
  variable: "--font-brand-body",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

const data = IBM_Plex_Mono({
  variable: "--font-brand-data",
  subsets: ["latin"],
  weight: ["400", "500"],
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
    <html lang="en" className={`${display.variable} ${body.variable} ${data.variable}`}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
