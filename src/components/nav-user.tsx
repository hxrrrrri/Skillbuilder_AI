"use client";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { landingPathForRole, isRole } from "@/lib/auth/roles";

export function NavUser() {
  const { data, status } = useSession();
  if (status === "loading") {
    return <span className="text-xs text-muted">…</span>;
  }
  if (!data?.user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent/60 hover:text-accent sm:text-sm"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="hidden rounded-md border border-accent/70 bg-accent px-3 py-1.5 text-xs font-semibold text-cream shadow-glow hover:bg-[#ba654f] sm:inline-block sm:text-sm"
        >
          Get started
        </Link>
      </div>
    );
  }

  const role = isRole(data.user.role) ? data.user.role : "candidate";
  const dashboard = landingPathForRole(role);
  const initials =
    (data.user.name ?? data.user.email ?? "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "U";

  return (
    <div className="flex items-center gap-3">
      <Link
        href={dashboard}
        className="hidden text-xs text-muted hover:text-ink sm:inline sm:text-sm"
        title={`${data.user.email} · ${role.replace("_", " ")}`}
      >
        {role.replace("_", " ")}
      </Link>
      <Link
        href={dashboard}
        className="grid h-8 w-8 place-items-center rounded-md border border-border bg-panel2 text-xs font-semibold text-accent"
        aria-label="Go to your dashboard"
      >
        {initials}
      </Link>
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs text-muted transition hover:border-accent/60 hover:text-accent"
      >
        Sign out
      </button>
    </div>
  );
}
