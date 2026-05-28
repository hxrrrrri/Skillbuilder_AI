import type { Metadata } from "next";
import { JetBrains_Mono, Lora, Manrope } from "next/font/google";
import "./globals.css";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { SiteHeader } from "@/components/site-header";

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

const display = Lora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SkillProof AI — Verify developer skill from real work",
  description:
    "Proof-of-work hiring for AI-native developers. Paste a GitHub repo and get a verified skill profile employers trust.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} ${mono.variable} min-h-screen font-sans antialiased`}>
        <AuthSessionProvider>
          <SiteHeader />
          <main className="mx-auto max-w-screen-2xl px-6 pb-12 pt-28 sm:px-10 lg:px-16">{children}</main>
          <footer className="border-t border-border bg-bg/80 py-7 text-center text-xs text-muted">
            SkillProof AI · Proof, not claims · Built for the AI era
          </footer>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
