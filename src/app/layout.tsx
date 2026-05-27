import type { Metadata } from "next";
import { EB_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "SkillProof AI — Verify developer skill from real work",
  description:
    "Proof-of-work hiring for AI-native developers. Paste a GitHub repo and get a verified skill profile employers trust.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable} ${mono.variable} min-h-screen font-sans antialiased`}>
        <header className="sticky top-0 z-40 border-b border-border bg-bg/92 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
            <a href="/" className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-md border border-border bg-panel2 text-sm font-semibold text-accent shadow-card">
                S
              </span>
              <span className="font-display text-xl font-medium text-ink">
                Skill<span className="text-accent">Proof</span>
              </span>
            </a>
            <nav className="flex items-center gap-2 text-sm text-muted sm:gap-5">
              <a href="/" className="hidden hover:text-ink sm:inline">Home</a>
              <a href="/campus-preview" className="hidden hover:text-ink sm:inline">Campus</a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent/60 hover:text-accent sm:text-sm"
              >
                Docs
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:py-12">{children}</main>
        <footer className="border-t border-border bg-panel/20 py-6 text-center text-xs text-muted">
          SkillProof AI · Missions-architecture · Built for the hackathon
        </footer>
      </body>
    </html>
  );
}
