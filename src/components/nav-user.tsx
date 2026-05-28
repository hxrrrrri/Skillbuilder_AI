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
      <div className="flex items-center gap-6">
        <Link
          href="/login"
          className="hidden text-sm text-muted transition hover:text-ink sm:inline"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-full border border-white/10 bg-ink px-4 py-1.5 text-xs font-semibold text-bg transition hover:bg-ink/80"
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
    <div className="flex items-center gap-6">
      <Link
        href={dashboard}
        className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/10 text-xs font-semibold text-ink"
        aria-label={`Go to dashboard · ${data.user.email} · ${role.replace("_", " ")}`}
        title={`${data.user.email} · ${role.replace("_", " ")}`}
      >
        {initials}
      </Link>
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-full border border-white/10 bg-ink px-4 py-1.5 text-xs font-semibold text-bg transition hover:bg-ink/80"
      >
        Sign out
      </button>
    </div>
  );
}
