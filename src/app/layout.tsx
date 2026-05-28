import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { NavUser } from "@/components/nav-user";

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700", "800"],
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
      <body className={`${sans.variable} ${mono.variable} min-h-screen font-sans antialiased`}>
        <AuthSessionProvider>
          <header className="fixed left-1/2 top-5 z-50 w-[920px] max-w-[calc(100vw-2rem)] -translate-x-1/2">
            <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-5 rounded-full border border-white/[0.08] bg-panel2/95 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md">
              <a href="/" className="flex min-w-0 items-center gap-2 justify-self-start">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-bg">
                  S
                </span>
                <span className="hidden truncate text-sm font-semibold text-ink md:inline">SkillProof</span>
              </a>
              <nav className="hidden items-center gap-5 justify-self-center text-sm text-muted sm:flex">
                <a href="/" className="transition hover:text-ink">Home</a>
                <a href="/campus-preview" className="transition hover:text-ink">Campus</a>
                <a href="/candidate/new-verification" className="transition hover:text-ink">Verify</a>
                <a href="/employer/search" className="transition hover:text-ink">Talent</a>
              </nav>
              <div className="justify-self-end">
                <NavUser />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-screen-2xl px-6 pt-28 pb-12 sm:px-10 lg:px-16">{children}</main>
          <footer className="border-t border-border bg-panel/20 py-6 text-center text-xs text-muted">
            SkillProof AI · Proof, not claims · Built for the AI era
          </footer>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
