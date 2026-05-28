"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, TextArea } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HeroProofGraphic, SectionPictogram } from "@/components/brand/skillproof-mark";

const SAMPLE_REPOS = [
  "https://github.com/vercel/next.js",
  "https://github.com/anthropics/anthropic-cookbook",
  "https://github.com/openai/openai-python",
];

type Mode = "api" | "cli" | "hybrid" | "local";

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
          local_install_approved:
            localInstallApproved &&
            (executionMode === "cli" || executionMode === "hybrid" || executionMode === "local"),
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
    <div className="space-y-20">
      <section className="border-b border-border pb-16 pt-4 text-center">
        <div className="mx-auto flex max-w-4xl flex-col items-center">
          <Badge tone="accent" className="mb-8">
            Proof-of-work hiring infrastructure
          </Badge>
          <HeroProofGraphic className="mb-7" />
          <h1 className="max-w-4xl font-display text-5xl font-medium leading-[1.05] text-ink md:text-6xl lg:text-7xl">
            Turn real GitHub work into verified hiring evidence.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-muted md:text-xl">
            SkillProof runs specialist agents against a candidate repo, audits every score with a
            fresh-context validator, and publishes a credibility profile employers can inspect.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <Badge>Validation contract first</Badge>
            <Badge>Creator-verifier separation</Badge>
            <Badge>Evidence locker</Badge>
            <Badge>Own-code interview</Badge>
          </div>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          {[
            ["13", "specialist agents"],
            ["100%", "file-backed claims"],
            ["1", "shareable profile"],
          ].map(([value, label]) => (
            <div key={label} className="bg-bg px-6 py-7 text-left">
              <div className="font-display text-4xl text-ink">{value}</div>
              <div className="mt-2 text-xs uppercase tracking-wide text-muted">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="start-verification" className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-5">
          <SectionPictogram type="contract" className="mb-6 text-accent" />
          <h2 className="max-w-xl font-display text-4xl font-medium leading-tight text-ink md:text-5xl">
            Start a verification mission
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted">
            Paste a public repo and SkillProof will build the evidence pack.
          </p>
          <pre className="mt-8 overflow-x-auto rounded-lg border border-border bg-panel/72 p-5 font-mono text-xs leading-6 text-body">
            <code>{`const mission = await skillproof.verify({
  repo: "github.com/owner/repo",
  contract: "role-fit-first",
  validator: "fresh-context",
  output: "public-profile"
})`}</code>
          </pre>
        </div>

        <div className="lg:col-span-7">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border bg-panel2/70 px-5 py-4">
              <span className="h-3 w-3 rounded-full bg-bad" />
              <span className="h-3 w-3 rounded-full bg-warn" />
              <span className="h-3 w-3 rounded-full bg-good" />
              <span className="ml-auto rounded border border-border px-2 py-1 font-mono text-[11px] text-muted">
                mission.config.ts
              </span>
            </div>
            <CardBody className="space-y-4 bg-panel/88">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Public GitHub repo URL
                </label>
                <Input
                  className="mt-1"
                  placeholder="https://github.com/owner/repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Your name</label>
                  <Input
                    className="mt-1"
                    placeholder="Jane Dev"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                    GitHub user (optional)
                  </label>
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
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Target role</label>
                  <Input className="mt-1" value={role} onChange={(e) => setRole(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Level</label>
                  <Input className="mt-1" value={level} onChange={(e) => setLevel(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Job description (optional)
                </label>
                <TextArea
                  className="mt-1"
                  placeholder="Paste a JD to focus the rubric…"
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">Execution mode</label>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs sm:grid-cols-4">
                  {(["api", "cli", "hybrid", "local"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setExecutionMode(m)}
                      className={`rounded-md border px-2 py-2 font-medium transition ${
                        executionMode === m
                          ? "border-accent/70 bg-accent/10 text-ink"
                          : "border-border bg-bg/40 text-muted hover:border-accent/50 hover:text-ink"
                      }`}
                    >
                      {m === "api" && "Cloud API"}
                      {m === "cli" && "Local CLI"}
                      {m === "hybrid" && "Hybrid"}
                      {m === "local" && "Local"}
                    </button>
                  ))}
                </div>
                {(executionMode === "cli" || executionMode === "hybrid" || executionMode === "local") && (
                  <label className="mt-3 flex items-start gap-2 rounded-md border border-border bg-bg/40 p-3 text-xs leading-5 text-muted">
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
                <div className="mt-2 text-[11px] text-muted">
                  {recommendedMode && (
                    <span>
                      Recommended: <span className="text-accent">{recommendedMode}</span> ·{" "}
                    </span>
                  )}
                  <a href="/local-setup" className="text-accent hover:text-ink">
                    Local setup ↗
                  </a>
                </div>
              </div>
              {error && <div className="text-sm text-bad">{error}</div>}
              <Button size="lg" className="w-full" onClick={start} disabled={loading}>
                {loading ? "Starting mission…" : "Run SkillProof mission →"}
              </Button>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted">
                <span>Try:</span>
                {SAMPLE_REPOS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="rounded-md border border-border bg-panel2 px-2 py-1.5 hover:border-accent/50 hover:text-ink"
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

      <section className="border-y border-border py-14">
        <div className="mb-10">
          <div className="text-xs uppercase tracking-wide text-muted">Mission architecture</div>
          <h2 className="mt-3 font-display text-4xl font-medium text-ink md:text-5xl">
            Contract, audit, verify.
          </h2>
        </div>
        <div className="divide-y divide-border">
          {[
            ["contract", "01 — Orchestrate", "Validation contract first", "The orchestrator writes the rubric before any analysis. Correctness is defined independently, before any scoring begins."],
            ["audit", "02 — Audit", "Workers + validator", "Architecture, code quality, testing, security, git evidence, docs, authenticity — each agent runs serially with structured handoffs. A separate validator audits every claim."],
            ["verify", "03 — Verify", "Own-code interview", "Own-code interview questions are generated from the candidate's code. Every score is backed by file evidence. The output is a shareable verified profile."],
          ].map(([icon, step, title, detail]) => (
            <div key={step} className="grid gap-5 py-8 md:grid-cols-[220px_1fr] md:items-start">
              <div className="flex items-center gap-4">
                <SectionPictogram type={icon as "contract" | "audit" | "verify"} className="h-8 w-8 text-muted" />
                <span className="text-xs uppercase tracking-wide text-accent">{step}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-[280px_1fr]">
                <h3 className="font-display text-2xl font-medium leading-tight text-body">{title}</h3>
                <p className="text-sm leading-7 text-muted">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-accent/45 bg-accent/95 p-8 text-bg">
          <SectionPictogram type="account" className="mb-8 text-bg/80" />
          <div className="text-xs uppercase tracking-wide text-bg/75">For candidates</div>
          <h2 className="mt-3 font-display text-4xl font-medium leading-tight text-bg">
            Show the work behind the resume.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-bg/85">
            Walk employers through your real repo, verified scores, and own-code interview evidence.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-panel/75 p-8">
          <SectionPictogram type="audit" className="mb-8 text-accent" />
          <div className="text-xs uppercase tracking-wide text-accent">For employers</div>
          <h2 className="mt-3 font-display text-4xl font-medium leading-tight text-ink">
            Inspect strengths, risks, and follow-ups.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted">
            The verifier preview summarizes role fit, evidence quality, biggest risks, and suggested
            questions without hiding the underlying file references.
          </p>
        </div>
      </section>

      <section className="pb-4">
        <a href="/campus-preview" className="text-sm font-semibold text-accent hover:text-ink">
          Open Campus / Placement dashboard preview
        </a>
      </section>
    </div>
  );
}
