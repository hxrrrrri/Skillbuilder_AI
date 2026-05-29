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
      <div className="flex items-center gap-3 sm:gap-6">
        <Link
          href="/login"
          className="text-sm text-muted transition hover:text-ink"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-md border border-ink/90 bg-ink px-4 py-2 text-xs font-semibold text-bg transition hover:bg-cream"
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
    <div className="flex items-center gap-3 sm:gap-5">
      <Link
        href={dashboard}
        className="grid h-9 w-9 place-items-center rounded-md border border-border bg-panel2 text-xs font-semibold text-ink transition hover:border-accent/50"
        aria-label={`Go to dashboard · ${data.user.email} · ${role.replace("_", " ")}`}
        title={`${data.user.email} · ${role.replace("_", " ")}`}
      >
        {initials}
      </Link>
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-md border border-ink/90 bg-ink px-4 py-2 text-xs font-semibold text-bg transition hover:bg-cream"
      >
        Sign out
      </button>
    </div>
  );
}
