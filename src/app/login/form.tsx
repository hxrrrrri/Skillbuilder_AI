"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";

const DEMO_ACCOUNTS = [
  { label: "Candidate", email: "candidate@skillproof.dev" },
  { label: "Employer", email: "employer@skillproof.dev" },
  { label: "College admin", email: "college@skillproof.dev" },
  { label: "Platform admin", email: "admin@skillproof.dev" },
];

export function LoginForm({
  githubEnabled = false,
  googleEnabled = false,
}: {
  githubEnabled?: boolean;
  googleEnabled?: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search?.get("callbackUrl") ?? undefined;
  const errorParam = search?.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(errorParam ? "Invalid email or password." : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });
    setLoading(false);
    if (!res || res.error) {
      setError("Invalid email or password.");
      return;
    }
    const target = res.url || callbackUrl || "/post-login";
    router.replace(target);
    router.refresh();
  }

  function fillDemo(addr: string) {
    setEmail(addr);
    setPassword("demo1234");
  }

  function oauthSignIn(provider: "github" | "google") {
    signIn(provider, { callbackUrl: callbackUrl ?? "/post-login" });
  }

  return (
    <Card className="mt-6">
      <CardBody>
        {(githubEnabled || googleEnabled) && (
          <div className="mb-4 space-y-2">
            {githubEnabled && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => oauthSignIn("github")}
              >
                Continue with GitHub
              </Button>
            )}
            {googleEnabled && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => oauthSignIn("google")}
              >
                Continue with Google
              </Button>
            )}
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted">
              <div className="h-px flex-1 bg-border" />
              <span>or</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Email</label>
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Password</label>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 border-t border-border pt-4 text-xs text-muted">
          <p className="font-semibold uppercase tracking-wide text-ink">Demo accounts</p>
          <p className="mt-1">Password is <code className="rounded bg-panel2 px-1">demo1234</code> for every seeded account.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((acct) => (
              <button
                key={acct.email}
                type="button"
                onClick={() => fillDemo(acct.email)}
                className="rounded-md border border-border bg-panel2 px-2 py-1.5 text-left text-xs text-ink transition hover:border-accent/60 hover:text-accent"
              >
                <div className="font-semibold">{acct.label}</div>
                <div className="text-muted">{acct.email}</div>
              </button>
            ))}
          </div>
        </div>

        <p className="mt-6 text-sm text-muted">
          New here?{" "}
          <Link href="/register" className="text-accent hover:underline">
            Create an account
          </Link>
          .
        </p>
      </CardBody>
    </Card>
  );
}
