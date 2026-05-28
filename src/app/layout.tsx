import type { Metadata } from "next";
import { EB_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { NavUser } from "@/components/nav-user";

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
        <AuthSessionProvider>
          <header className="fixed left-1/2 top-5 z-50 -translate-x-1/2 w-[700px] max-w-[calc(100vw-2rem)]">
            <div className="flex w-full items-center rounded-full border border-white/[0.08] bg-panel2/95 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md">
              <div className="flex flex-1 items-center">
                <a href="/" className="flex items-center justify-center h-8 w-8 rounded-full bg-ink text-bg text-sm font-bold shrink-0">
                  S
                </a>
              </div>
              <nav className="hidden items-center gap-6 text-sm text-muted sm:flex">
                <a href="/" className="transition hover:text-ink">Home</a>
                <a href="/campus-preview" className="transition hover:text-ink">Campus</a>
              </nav>
              <div className="flex flex-1 items-center justify-end">
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
