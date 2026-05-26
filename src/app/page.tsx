"use client";
import { useState } from "react";
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

export default function Landing() {
  const [repoUrl, setRepoUrl] = useState("");
  const [role, setRole] = useState("Full-stack developer");
  const [level, setLevel] = useState("Junior");
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function start() {
    setError(null);
    if (!repoUrl) {
      setError("Paste a GitHub repo URL.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_url: repoUrl,
          target_role: role,
          candidate_level: level,
          job_description: jd || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "failed");
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
          <Badge tone="accent" className="mb-4">Proof-of-work hiring</Badge>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            Verify developer skill from <span className="gradient-text">real work</span>.
          </h1>
          <p className="mt-4 max-w-xl text-muted">
            Paste a public GitHub repo. A team of specialist agents writes a validation contract,
            audits the code, runs a fresh-context validator, generates a repo-based interview,
            and ships a credibility profile employers can actually trust.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted">
            <Badge>Validation contract first</Badge>
            <Badge>Serial agents, parallel reads</Badge>
            <Badge>Creator–verifier separation</Badge>
            <Badge>Token-efficient context pack</Badge>
          </div>
        </div>
        <div className="md:col-span-2">
          <Card className="shadow-glow">
            <CardBody className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-muted">GitHub repo URL</label>
                <Input
                  className="mt-1"
                  placeholder="https://github.com/owner/repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                />
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
              independently of what the candidate built — no after-the-fact rationalization.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-accent">02 — Audit</div>
            <div className="mt-1 font-semibold">Serial workers + fresh-context validator</div>
            <p className="mt-2 text-sm text-muted">
              Architecture, code quality, testing, security, git evidence — each agent runs serially
              with a structured handoff. A separate validator with no memory of prior steps audits every claim.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-accent">03 — Verify</div>
            <div className="mt-1 font-semibold">Skill graph + repo-based interview</div>
            <p className="mt-2 text-sm text-muted">
              Each score is backed by file evidence. Mock interview questions are generated from
              the candidate's own code, so bluffing is hard. The output is a shareable verified profile.
            </p>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
