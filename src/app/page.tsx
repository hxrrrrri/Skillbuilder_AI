"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, TextArea } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SAMPLE_REPOS = [
  "https://github.com/vercel/next.js",
  "https://github.com/anthropics/anthropic-cookbook",
  "https://github.com/openai/openai-python",
];

type Mode = "api" | "cli" | "hybrid" | "mock";

export default function Landing() {
  const [repoUrl, setRepoUrl] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [role, setRole] = useState("Full-stack developer");
  const [level, setLevel] = useState("Junior");
  const [jd, setJd] = useState("");
  const [executionMode, setExecutionMode] = useState<Mode>("api");
  const [localInstallApproved, setLocalInstallApproved] = useState(false);
  const [recommendedMode, setRecommendedMode] = useState<Mode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/local/tools", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: any) => {
        if (d?.recommendedMode) {
          setRecommendedMode(d.recommendedMode);
          setExecutionMode(d.recommendedMode);
        }
      })
      .catch(() => {});
  }, []);

  async function start() {
    setError(null);
    if (!repoUrl) {
      setError("Paste a GitHub repo URL.");
      return;
    }
    if (!candidateName.trim()) {
      setError("Add your name so the verified profile has an owner.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_url: repoUrl,
          candidate_name: candidateName,
          github_username: githubUsername || undefined,
          target_role: role,
          candidate_level: level,
          job_description: jd || undefined,
          execution_mode: executionMode,
          local_install_approved: localInstallApproved && (executionMode === "cli" || executionMode === "hybrid"),
        }),
      });
      const data = await r.json();
      if (r.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent("/candidate/new-verification")}`);
        return;
      }
      if (!r.ok) throw new Error(data?.detail ?? data?.error ?? "failed");
      router.push(`/candidate/runs/${data.run_id}`);
    } catch (e: any) {
      setError(e.message ?? "Failed to start mission.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-14">
      <section className="grid items-center gap-8 pt-2 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-6">
          <Badge tone="accent" className="mb-5">Proof-of-work hiring infrastructure</Badge>
          <h1 className="max-w-3xl font-display text-5xl leading-[1.03] text-ink md:text-6xl">
            Turn real GitHub work into verified hiring evidence.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-body md:text-lg">
            SkillProof runs specialist agents against a candidate repo, audits every score with a
            fresh-context validator, and publishes a credibility profile employers can inspect.
          </p>
          <div className="mt-7 flex flex-wrap gap-2 text-xs text-muted">
            <Badge>Validation contract first</Badge>
            <Badge>Creator-verifier separation</Badge>
            <Badge>Evidence locker</Badge>
            <Badge>Own-code interview</Badge>
          </div>

          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            {[
              ["13", "specialist agents"],
              ["100%", "file-backed claims"],
              ["1", "shareable profile"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-lg border border-border bg-panel/70 p-4">
                <div className="font-display text-3xl text-ink">{value}</div>
                <div className="mt-1 text-xs uppercase tracking-wide text-muted">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6">
          <Card className="overflow-hidden shadow-glow">
            <div className="border-b border-border bg-panel2/70 px-5 py-4">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-bad" />
                <span className="h-3 w-3 rounded-full bg-warn" />
                <span className="h-3 w-3 rounded-full bg-good" />
                <span className="ml-auto rounded border border-border px-2 py-1 font-mono text-[11px] text-muted">
                  mission.config.ts
                </span>
              </div>
              <pre className="overflow-x-auto rounded-md border border-border bg-bg/70 p-4 font-mono text-xs leading-6 text-body">
                <code>{`const mission = await skillproof.verify({
  repo: "github.com/owner/repo",
  contract: "role-fit-first",
  validator: "fresh-context",
  output: "public-profile"
})`}</code>
              </pre>
            </div>
            <CardBody className="space-y-4 bg-panel/92">
              <div>
                <div className="font-display text-2xl text-ink">Start a verification mission</div>
                <p className="mt-1 text-sm text-muted">
                  Paste a public repo and SkillProof will build the evidence pack.
                </p>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-muted">Public GitHub repo URL</label>
                <Input
                  className="mt-1"
                  placeholder="https://github.com/owner/repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-wide text-muted">Your name</label>
                  <Input
                    className="mt-1"
                    placeholder="Jane Dev"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-muted">GitHub user (optional)</label>
                  <Input
                    className="mt-1"
                    placeholder="janedev"
                    value={githubUsername}
                    onChange={(e) => setGithubUsername(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-wide text-muted">Target role</label>
                  <Input className="mt-1" value={role} onChange={(e) => setRole(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-muted">Level</label>
                  <Input className="mt-1" value={level} onChange={(e) => setLevel(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-muted">Job description (optional)</label>
                <TextArea
                  className="mt-1"
                  placeholder="Paste a JD to focus the rubric…"
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-muted">Execution mode</label>
                <div className="mt-1 grid grid-cols-2 gap-1 text-xs sm:grid-cols-4">
                  {(["api", "cli", "hybrid", "mock"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setExecutionMode(m)}
                      className={`rounded-md border px-2 py-2 font-medium transition ${
                        executionMode === m
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-bg/30 text-muted hover:border-accent/50 hover:text-ink"
                      }`}
                    >
                      {m === "api" && "Cloud API"}
                      {m === "cli" && "Local CLI"}
                      {m === "hybrid" && "Hybrid"}
                      {m === "mock" && "Mock"}
                    </button>
                  ))}
                </div>
                {(executionMode === "cli" || executionMode === "hybrid") && (
                  <label className="mt-3 flex items-start gap-2 rounded-md border border-border bg-bg/30 p-3 text-xs text-muted">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={localInstallApproved}
                      onChange={(e) => setLocalInstallApproved(e.target.checked)}
                    />
                    <span>
                      Approve dependency install for local proof. SkillProof will detect the lockfile, run the safest install command, then run test/build/typecheck/lint when scripts exist.
                    </span>
                  </label>
                )}
                <div className="mt-1 text-[11px] text-muted">
                  {recommendedMode && (
                    <span>
                      Recommended: <span className="text-accent">{recommendedMode}</span> ·{" "}
                    </span>
                  )}
                  <a href="/local-setup" className="text-accent hover:underline">
                    Local setup ↗
                  </a>
                </div>
              </div>
              {error && <div className="text-sm text-bad">{error}</div>}
              <Button size="lg" className="w-full" onClick={start} disabled={loading}>
                {loading ? "Starting mission…" : "Run SkillProof mission →"}
              </Button>
              <button
                type="button"
                className="w-full rounded-md border border-dashed border-border bg-bg/20 px-3 py-2 text-xs font-medium text-muted transition hover:border-accent hover:text-accent"
                onClick={async () => {
                  setLoading(true);
                  try {
                    const r = await fetch("/api/demo/seed");
                    const d = await r.json();
                    if (d?.profile_url) router.push(d.profile_url);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                Open Demo Mission (sample data)
              </button>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted">
                <span>Try:</span>
                {SAMPLE_REPOS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="rounded border border-border bg-panel2 px-2 py-1 hover:border-accent/50 hover:text-accent"
                    onClick={() => setRepoUrl(r)}
                  >
                    {r.replace("https://github.com/", "")}
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      <section className="border-y border-border py-10">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wide text-muted">Mission architecture</div>
          <h2 className="mt-2 font-display text-4xl text-ink">Contract, audit, verify.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-panel2/70">
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-accent">01 — Orchestrate</div>
            <div className="mt-3 font-display text-2xl text-ink">Validation contract first</div>
            <p className="mt-2 text-sm leading-6 text-muted">
              The orchestrator writes the rubric before any analysis. Correctness is defined
              independently, before any scoring begins.
            </p>
          </CardBody>
        </Card>
        <Card className="bg-panel2/70">
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-accent">02 — Audit</div>
            <div className="mt-3 font-display text-2xl text-ink">Workers + validator</div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Architecture, code quality, testing, security, git evidence, docs, authenticity —
              each agent runs serially with structured handoffs. A separate validator audits every claim.
            </p>
          </CardBody>
        </Card>
        <Card className="bg-panel2/70">
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-accent">03 — Verify</div>
            <div className="mt-3 font-display text-2xl text-ink">Own-code interview</div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Mock interview questions are generated from the candidate&apos;s own code. Every score is
              backed by file evidence. The output is a shareable verified profile.
            </p>
          </CardBody>
        </Card>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-accent/50 bg-accent p-8 text-cream">
          <div className="text-xs uppercase tracking-wide text-cream/80">For candidates</div>
          <h2 className="mt-3 font-display text-4xl text-cream">Show the work behind the resume.</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-cream/90">
            Walk employers through your real repo, verified scores, and own-code interview evidence.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-panel2/70 p-8">
          <div className="text-xs uppercase tracking-wide text-accent2">For employers</div>
          <h2 className="mt-3 font-display text-4xl text-ink">Inspect strengths, risks, and follow-ups.</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            The verifier preview summarizes role fit, evidence quality, biggest risks, and suggested
            questions without hiding the underlying file references.
          </p>
        </div>
      </section>

      <section className="pb-4">
        <a href="/campus-preview" className="text-sm font-semibold text-accent hover:underline">
          ↗ Open Campus / Placement dashboard preview
        </a>
      </section>
    </div>
  );
}
