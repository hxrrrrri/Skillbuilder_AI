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
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? data?.error ?? "failed");
      router.push(`/mission/${data.run_id}`);
    } catch (e: any) {
      setError(e.message ?? "Failed to start mission.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-10">
      <section className="grid items-center gap-8 pt-6 md:grid-cols-5">
        <div className="md:col-span-3">
          <Badge tone="accent" className="mb-4">Proof-of-work hiring infrastructure</Badge>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            SkillProof AI converts real GitHub work into{" "}
            <span className="gradient-text">verified hiring evidence</span>.
          </h1>
          <p className="mt-4 max-w-xl text-muted">
            Stop reading resumes. A mission of specialist agents writes a validation contract,
            audits a candidate's repo, runs a fresh-context validator, generates own-code interview
            questions, and ships an evidence-backed credibility profile employers can actually verify.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted">
            <Badge>Validation contract first</Badge>
            <Badge>Serial agents, parallel reads</Badge>
            <Badge>Creator–verifier separation</Badge>
            <Badge>Token-efficient context pack</Badge>
            <Badge>Evidence locker</Badge>
            <Badge>Own-code interview</Badge>
          </div>
        </div>
        <div className="md:col-span-2">
          <Card className="shadow-glow">
            <CardBody className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-muted">Public GitHub repo URL</label>
                <Input
                  className="mt-1"
                  placeholder="https://github.com/owner/repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
                <div className="mt-1 grid grid-cols-4 gap-1 text-xs">
                  {(["api", "cli", "hybrid", "mock"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setExecutionMode(m)}
                      className={`rounded border px-2 py-1.5 ${
                        executionMode === m
                          ? "border-accent text-accent"
                          : "border-border text-muted hover:text-ink"
                      }`}
                    >
                      {m === "api" && "Cloud API"}
                      {m === "cli" && "Local CLI"}
                      {m === "hybrid" && "Hybrid"}
                      {m === "mock" && "Mock"}
                    </button>
                  ))}
                </div>
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
                className="w-full rounded border border-dashed border-border px-3 py-2 text-xs text-muted hover:border-accent hover:text-accent"
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
                    className="rounded border border-border bg-panel2 px-2 py-0.5 hover:text-accent"
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

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-accent">01 — Orchestrate</div>
            <div className="mt-1 font-semibold">Validation contract first</div>
            <p className="mt-2 text-sm text-muted">
              The orchestrator writes the rubric before any analysis. Correctness is defined
              independently — no after-the-fact rationalization.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-accent">02 — Audit</div>
            <div className="mt-1 font-semibold">Workers + fresh-context validator</div>
            <p className="mt-2 text-sm text-muted">
              Architecture, code quality, testing, security, git evidence, docs, authenticity —
              each agent runs serially with structured handoffs. A separate validator audits every claim.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-accent">03 — Verify</div>
            <div className="mt-1 font-semibold">Own-code interview + evidence locker</div>
            <p className="mt-2 text-sm text-muted">
              Mock interview questions are generated from the candidate's own code. Every score is
              backed by file evidence. The output is a shareable verified profile.
            </p>
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-accent2">For candidates</div>
            <p className="mt-2 text-sm text-muted">
              Show employers what you actually built. Walk recruiters through your real repo,
              defended by an own-code interview. No more screening lottery.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-accent2">For employers</div>
            <p className="mt-2 text-sm text-muted">
              Open the Employer Verifier preview on any profile. See verified strengths, biggest
              risks, suggested follow-up questions, and a shortlist recommendation.
            </p>
          </CardBody>
        </Card>
      </section>

      <section>
        <a href="/campus-preview" className="text-sm text-accent hover:underline">
          ↗ Open Campus / Placement dashboard preview
        </a>
      </section>
    </div>
  );
}
