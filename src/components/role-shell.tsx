import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type NavLink = { href: string; label: string; badge?: string };

export function RoleShell({
  title,
  subtitle,
  navLinks,
  activeHref,
  children,
}: {
  title: string;
  subtitle: string;
  navLinks: NavLink[];
  activeHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <header className="border-b border-border pb-6">
        <h1 className="font-display text-4xl font-medium leading-tight text-ink">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{subtitle}</p>
      </header>
      <nav className="flex flex-wrap gap-2 border-b border-border pb-4">
        {navLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-md border px-3 py-2 text-xs font-medium transition",
              activeHref === l.href
                ? "border-accent/60 bg-panel2 text-ink"
                : "border-border bg-panel/40 text-muted hover:border-accent/60 hover:text-ink",
            )}
          >
            {l.label}
            {l.badge && (
              <span className="ml-1 rounded bg-bg px-1.5 text-[10px] uppercase tracking-wide text-accent">
                {l.badge}
              </span>
            )}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

export function ScaffoldNotice({
  title = "No data yet",
  detail,
}: {
  title?: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-accent/40 bg-accent/10 px-4 py-3 text-xs text-ink">
      <span className="font-semibold text-accent">{title}.</span> {detail}
    </div>
  );
}
