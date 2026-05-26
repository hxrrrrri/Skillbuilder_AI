import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillProof AI — Verify developer skill from real work",
  description:
    "Proof-of-work hiring for AI-native developers. Paste a GitHub repo and get a verified skill profile employers trust.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-border bg-bg/70 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
            <a href="/" className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-black font-bold">S</span>
              <span className="font-semibold">
                Skill<span className="gradient-text">Proof</span>
              </span>
            </a>
            <nav className="flex items-center gap-5 text-sm text-muted">
              <a href="/" className="hover:text-ink">Home</a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-ink"
              >
                Docs
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        <footer className="border-t border-border py-6 text-center text-xs text-muted">
          SkillProof AI · Missions-architecture · Built for the hackathon
        </footer>
      </body>
    </html>
  );
}
