"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { NavUser } from "@/components/nav-user";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/demo", label: "Demo" },
  { href: "/campus-preview", label: "Campus" },
  { href: "/candidate/new-verification", label: "Verify" },
  { href: "/employer/search", label: "Talent" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-bg/95 backdrop-blur-xl">
      <div className="mx-auto grid h-20 max-w-screen-2xl grid-cols-[auto_1fr_auto] items-center gap-4 px-6 sm:px-10 lg:px-16">
        <Link href="/" className="group flex items-center gap-3" onClick={() => setOpen(false)}>
          <Image src="/logo.png" alt="SkillProof" width={32} height={32} className="h-8 w-8 object-contain transition group-hover:scale-110" />
          <span className="font-display text-2xl font-semibold leading-none text-ink">SkillProof</span>
        </Link>

        <nav className="hidden justify-self-center md:flex md:items-center md:gap-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm text-muted transition hover:text-ink",
                pathname === link.href && "text-ink",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-3">
          <div className="hidden sm:block">
            <NavUser />
          </div>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-panel text-muted transition hover:border-accent/50 hover:text-ink md:hidden"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="relative h-4 w-5">
              <span
                className={cn(
                  "absolute left-0 top-1 block h-px w-5 bg-current transition",
                  open && "top-2 rotate-45",
                )}
              />
              <span
                className={cn(
                  "absolute bottom-1 left-0 block h-px w-5 bg-current transition",
                  open && "bottom-[7px] -rotate-45",
                )}
              />
            </span>
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-panel/98 px-6 py-4 shadow-card md:hidden">
          <nav className="grid gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-md px-3 py-3 text-sm text-muted transition hover:bg-bg hover:text-ink",
                  pathname === link.href && "bg-bg text-ink",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 border-t border-border pt-4 sm:hidden">
            <NavUser />
          </div>
        </div>
      )}
    </header>
  );
}
