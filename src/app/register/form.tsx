"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";

type Choice = "candidate" | "employer" | "college_admin";

const ROLE_OPTIONS: { id: Choice; label: string; blurb: string }[] = [
  { id: "candidate", label: "Candidate", blurb: "Prove your skill from real GitHub work." },
  { id: "employer", label: "Employer", blurb: "Shortlist verified developers." },
  { id: "college_admin", label: "College admin", blurb: "Track cohort readiness and skill gaps." },
];

export function RegisterForm() {
  const router = useRouter();
  const [role, setRole] = useState<Choice>("candidate");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsTenant = role === "employer" || role === "college_admin";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          tenant_name: needsTenant ? tenantName : undefined,
          github_username: role === "candidate" ? githubUsername || undefined : undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data?.error === "email_taken" ? "Email already registered." : data?.error ?? "Failed to register.");
        return;
      }
      const signed = await signIn("credentials", { email, password, redirect: false });
      if (signed?.error) {
        setError("Account created but sign-in failed. Try signing in manually.");
        return;
      }
      router.replace("/post-login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">I am a</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRole(opt.id)}
                  className={`rounded-md border px-2 py-2 text-left text-xs transition ${
                    role === opt.id
                      ? "border-accent bg-panel2 text-ink"
                      : "border-border bg-panel/40 text-muted hover:border-accent/60"
                  }`}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-[11px] leading-tight">{opt.blurb}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-muted">Minimum 8 characters.</p>
          </div>

          {role === "candidate" && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                GitHub username <span className="text-muted/70">(optional)</span>
              </label>
              <Input
                value={githubUsername}
                onChange={(e) => setGithubUsername(e.target.value)}
                placeholder="octocat"
                className="mt-1"
              />
            </div>
          )}

          {needsTenant && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                {role === "employer" ? "Company name" : "College name"}
              </label>
              <Input
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                required
                minLength={2}
                placeholder={role === "employer" ? "Acme Corp" : "ABC College of Engineering"}
                className="mt-1"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
          .
        </p>
      </CardBody>
    </Card>
  );
}
