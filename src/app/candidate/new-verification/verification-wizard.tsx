"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, TextArea } from "@/components/ui/input";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { TARGET_ROLES, CANDIDATE_LEVELS, CUSTOM_ROLE_LABEL, CUSTOM_LEVEL_LABEL, searchRoles } from "@/lib/roles";
import { cn } from "@/lib/utils";

type WizardUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  githubUsername: string;
};

type RepoPreview = {
  repo: {
    owner: string;
    name: string;
    full_name: string;
    default_branch: string;
    language: string | null;
    description: string | null;
    last_updated: string;
    visibility: string;
    public_access: boolean;
    stars: number;
    forks: number;
    size_kb: number;
  };
  detected: {
    package_manager: string | null;
    framework: string | null;
    has_tests: boolean;
    has_ci: boolean;
    has_prisma: boolean;
    files_indexed: number;
  };
};

type Readiness = {
  ok: boolean;
  mode: ExecutionMode;
  matrix: any | null;
  blockers: Array<{
    providerId: string;
    agentName?: string;
    reason: string;
    fix: string;
    lastTestStatus?: string | null;
    lastTestJsonOk?: boolean | null;
  }>;
  providers: Array<{
    provider_id: string;
    label: string;
    status: string;
    enabled: boolean;
    installed: boolean;
    authenticated: boolean;
    version: string | null;
    configured_model: string | null;
    available_models: string[];
    supports_json: boolean;
    supports_non_interactive: boolean;
    supports_reasoning_budget: boolean;
    latency_ms: number | null;
    last_error: string | null;
    fix: string;
  }>;
};

type ExecutionMode = "api" | "cli" | "hybrid" | "local";

type OwnershipChallenge = {
  challenge_id: string;
  token: string;
  expires_at: string;
  placement: {
    file: string;
    json: {
      provider: string;
      github_username: string;
      repo: string;
      ownership_challenge_id: string;
      token: string;
    };
    readme_line: string;
  };
};

const STEPS = [
  "GitHub identity",
  "Repository",
  "Role and rubric",
  "Provider readiness",
  "Local proof safety",
  "Start mission",
];

const ROLE_WEIGHTS = [
  ["Architecture", 15],
  ["Code quality", 15],
  ["Testing", 15],
  ["Debugging", 15],
  ["Git workflow", 10],
  ["Documentation", 10],
  ["Security", 10],
  ["Communication", 5],
  ["AI collaboration", 5],
] as const;

const MODE_LABELS: Record<ExecutionMode, { label: string; detail: string; required: string }> = {
  api: {
    label: "Cloud API",
    detail: "Provider analysis through configured cloud LLMs. Terminal proof remains not measured unless added later.",
    required: "Anthropic API or configured cloud provider with passing JSON health test.",
  },
  cli: {
    label: "Local CLI",
    detail: "CLI providers run locally. Terminal proof can run in the policy-gated workspace.",
    required: "Claude/Codex/Copilot CLI or Ollama providers with passing JSON health tests.",
  },
  hybrid: {
    label: "Hybrid",
    detail: "Uses API and local providers according to admin routing. Best for demos with terminal proof.",
    required: "All required routed providers must pass health checks.",
  },
  local: {
    label: "Local",
    detail: "Avoids cloud API routes. Uses local CLI/Ollama providers only.",
    required: "At least one local provider per required role with passing JSON health test.",
  },
};

function parseGithubUrl(value: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(value.trim());
    if (u.hostname.toLowerCase() !== "github.com" && u.hostname.toLowerCase() !== "www.github.com") return null;
    const [owner, rawRepo] = u.pathname.split("/").filter(Boolean);
    const repo = rawRepo?.replace(/\.git$/, "");
    if (!owner || !repo) return null;
    if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "unknown";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function readinessTone(status: string) {
  if (status === "ready") return "good" as const;
  if (status === "disabled" || status === "missing_binary" || status === "failed") return "bad" as const;
  return "warn" as const;
}

export function NewVerificationWizard({ user }: { user: WizardUser }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [githubUsername, setGithubUsername] = useState(user.githubUsername || "");
  const [repoUrl, setRepoUrl] = useState("");
  const [targetRole, setTargetRole] = useState("Full-stack Developer");
  const [candidateLevel, setCandidateLevel] = useState("Junior");
  const [jobDescription, setJobDescription] = useState("");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("hybrid");
  const [installApproved, setInstallApproved] = useState(false);
  const [includeToken, setIncludeToken] = useState(true);
  const [ownershipChallenge, setOwnershipChallenge] = useState<OwnershipChallenge | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RepoPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const parsedRepo = useMemo(() => parseGithubUrl(repoUrl), [repoUrl]);
  const ownershipToken = useMemo(() => {
    return ownershipChallenge?.token ?? "";
  }, [ownershipChallenge]);

  const strongestOwnership = useMemo(() => {
    if (githubUsername && parsedRepo && githubUsername.toLowerCase() === parsedRepo.owner.toLowerCase()) {
      return "verified owner candidate";
    }
    if (includeToken && ownershipToken) return "server-issued repo token available";
    if (githubUsername) return "self-declared until token or OAuth proof is found";
    return "unverified";
  }, [githubUsername, includeToken, ownershipToken, parsedRepo]);

  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (!parsedRepo) return;
    const handle = window.setTimeout(() => {
      void fetchPreview();
    }, 550);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoUrl]);

  useEffect(() => {
    void fetchReadiness(executionMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionMode]);

  useEffect(() => {
    setOwnershipChallenge(null);
    setChallengeError(null);
    if (!includeToken || !githubUsername.trim() || !parsedRepo) return;
    const handle = window.setTimeout(() => {
      void fetchOwnershipChallenge();
    }, 650);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeToken, githubUsername, repoUrl]);

  async function fetchPreview() {
    if (!parseGithubUrl(repoUrl)) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/repo/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPreviewError(data.message || data.error || "Repository preview failed.");
        setPreview(null);
      } else {
        setPreview(data);
      }
    } finally {
      setPreviewLoading(false);
    }
  }

  async function fetchReadiness(mode: ExecutionMode) {
    setReadinessLoading(true);
    try {
      const res = await fetch(`/api/providers/readiness?mode=${encodeURIComponent(mode)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setReadiness(data);
      else setReadiness({ ok: false, mode, matrix: null, blockers: [{ providerId: "unknown", reason: data.error || "readiness failed", fix: "Sign in as a candidate or admin and retry." }], providers: [] });
    } finally {
      setReadinessLoading(false);
    }
  }

  async function fetchOwnershipChallenge() {
    if (!parseGithubUrl(repoUrl) || !githubUsername.trim()) return;
    setChallengeLoading(true);
    setChallengeError(null);
    try {
      const res = await fetch("/api/ownership/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl, github_username: githubUsername.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOwnershipChallenge(null);
        setChallengeError(data.message || data.error || "ownership_challenge_failed");
      } else {
        setOwnershipChallenge(data);
      }
    } finally {
      setChallengeLoading(false);
    }
  }

  async function startMission() {
    setStartError(null);
    if (!parsedRepo) {
      setStartError("invalid repo: use a GitHub URL like https://github.com/owner/repo");
      setStep(2);
      return;
    }
    if (!readiness?.ok) {
      setStartError("provider_not_ready: fix the provider blockers before starting.");
      setStep(4);
      return;
    }
    if (includeToken && !ownershipChallenge) {
      setStartError("ownership_challenge_unavailable: generate a server-issued challenge token or disable token verification for a self-declared run.");
      setStep(1);
      return;
    }
    setStarting(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo_url: repoUrl,
          candidate_name: user.name,
          github_username: githubUsername.trim() || undefined,
          target_role: targetRole,
          candidate_level: candidateLevel,
          job_description: jobDescription || undefined,
          execution_mode: executionMode,
          local_install_approved: installApproved,
          ownership_token: includeToken && ownershipToken ? ownershipToken : undefined,
          ownership_challenge_id: includeToken && ownershipChallenge ? ownershipChallenge.challenge_id : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const blockers = Array.isArray(data.blockers)
          ? data.blockers.map((b: any) => `${b.agentName || b.providerId}: ${b.reason}. ${b.fix}`).join("\n")
          : "";
        setStartError(`${data.error || "mission_start_failed"}${blockers ? `\n${blockers}` : data.message ? `: ${data.message}` : ""}`);
        if (data.error === "provider_not_ready") setStep(4);
        return;
      }
      router.push(`/candidate/runs/${data.run_id}`);
    } finally {
      setStarting(false);
    }
  }

  const canAdvance =
    (step === 1 && !!githubUsername.trim()) ||
    (step === 2 && !!parsedRepo && !!preview && !previewLoading) ||
    (step === 3 && !!targetRole.trim() && !!candidateLevel.trim()) ||
    (step === 4 && readiness?.ok === true) ||
    step === 5 ||
    step === 6;

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
      <Card className="h-fit">
        <CardBody className="space-y-3">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStep(n)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition",
                  active ? "border-accent bg-accent/10 text-ink" : done ? "border-good/30 bg-good/5 text-ink" : "border-border bg-panel2/35 text-muted hover:text-ink",
                )}
              >
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border font-mono text-xs", done ? "border-good text-good" : active ? "border-accent text-accent" : "border-border text-muted")}>
                  {n}
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </CardBody>
      </Card>

      <div className="space-y-4">
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>GitHub identity and ownership</CardTitle>
            </CardHeader>
            <CardBody className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <InfoBox label="Signed in as" value={user.name} detail={user.email} />
                <InfoBox label="Account role" value={user.role} />
                <InfoBox label="Current trust" value={strongestOwnership} />
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink">GitHub username</span>
                <Input value={githubUsername} onChange={(e) => setGithubUsername(e.target.value)} placeholder="octocat" />
              </label>
              <div className="grid gap-3 md:grid-cols-5">
                {[
                  ["verified owner", "OAuth/app/gh owner match"],
                  ["verified collaborator", "Authenticated collaborator proof"],
                  ["repo token verified", ".skillproof-verify.json or README token"],
                  ["self-declared", "Low-trust and capped"],
                  ["unverified", "Not publish-ready"],
                ].map(([level, detail]) => (
                  <div key={level} className="rounded-md border border-border bg-panel2/35 p-3">
                    <div className="text-sm font-semibold text-ink">{level}</div>
                    <p className="mt-1 text-xs text-muted">{detail}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-accent/30 bg-accent/10 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={ownershipToken ? "good" : challengeError ? "bad" : "warn"}>
                    {challengeLoading ? "issuing token" : ownershipToken ? "server token issued" : challengeError ? "token issue failed" : "token pending repo"}
                  </Badge>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={includeToken} onChange={(e) => setIncludeToken(e.target.checked)} />
                    Use repo token verification when OAuth/gh proof is unavailable
                  </label>
                  <Button type="button" variant="outline" size="sm" onClick={fetchOwnershipChallenge} disabled={!parsedRepo || !githubUsername.trim() || challengeLoading || !includeToken}>
                    Issue new token
                  </Button>
                </div>
                <p className="mt-3 text-sm text-muted">
                  SkillProof issues and stores a signed challenge token before analysis. Add it to either `.skillproof-verify.json` or your README before terminal proof runs. If you skip it and no authenticated owner/collaborator signal exists, ownership remains self-declared.
                </p>
                {ownershipChallenge?.expires_at && (
                  <p className="mt-2 font-mono text-xs text-muted">
                    challenge_id={ownershipChallenge.challenge_id} expires={formatDate(ownershipChallenge.expires_at)}
                  </p>
                )}
                {challengeError && <p className="mt-2 text-xs text-bad">{challengeError}</p>}
                <pre className="mt-3 overflow-auto rounded-md border border-border bg-bg/70 p-3 font-mono text-xs text-ink">
                  {ownershipToken || "Enter GitHub username and repository URL, then issue a server challenge token."}
                </pre>
                <pre className="mt-3 overflow-auto rounded-md border border-border bg-bg/70 p-3 font-mono text-xs text-muted">
{ownershipChallenge ? JSON.stringify(ownershipChallenge.placement.json, null, 2) : `{
  "provider": "skillproof.ai",
  "github_username": "${githubUsername || "your-github-username"}",
  "repo": "${parsedRepo ? `${parsedRepo.owner}/${parsedRepo.repo}` : "owner/repo"}",
  "ownership_challenge_id": "server-issued",
  "token": "server-issued-after-repo-url"
}`}
                </pre>
                {ownershipChallenge?.placement.readme_line && (
                  <pre className="mt-3 overflow-auto rounded-md border border-border bg-bg/70 p-3 font-mono text-xs text-muted">
                    {ownershipChallenge.placement.readme_line}
                  </pre>
                )}
              </div>
            </CardBody>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Repository input</CardTitle>
            </CardHeader>
            <CardBody className="space-y-5">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink">GitHub repository URL</span>
                <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo" />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={parsedRepo ? "good" : "bad"}>{parsedRepo ? `${parsedRepo.owner}/${parsedRepo.repo}` : "invalid GitHub URL"}</Badge>
                {previewLoading && <Badge tone="warn">fetching metadata</Badge>}
                {previewError && <Badge tone="bad">{previewError}</Badge>}
                <Button type="button" variant="outline" size="sm" onClick={fetchPreview} disabled={!parsedRepo || previewLoading}>
                  Refresh preview
                </Button>
              </div>
              {preview ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <InfoBox label="Default branch" value={preview.repo.default_branch} />
                  <InfoBox label="Language" value={preview.repo.language || "not detected"} />
                  <InfoBox label="Updated" value={formatDate(preview.repo.last_updated)} />
                  <InfoBox label="Visibility" value={preview.repo.visibility} detail={preview.repo.public_access ? "GitHub API readable" : "Requires authenticated access"} />
                  <InfoBox label="Package manager" value={preview.detected.package_manager || "not detected"} />
                  <InfoBox label="Framework" value={preview.detected.framework || "not detected"} />
                  <InfoBox label="Files indexed" value={String(preview.detected.files_indexed)} detail={`${preview.detected.has_tests ? "tests detected" : "no tests detected"}; ${preview.detected.has_ci ? "CI detected" : "no CI detected"}`} />
                </div>
              ) : (
                <EmptyPanel detail={previewLoading ? "Reading GitHub metadata..." : "Enter a valid GitHub URL to preview repository evidence signals."} />
              )}
            </CardBody>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Role and rubric</CardTitle>
            </CardHeader>
            <CardBody className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-ink">Target role</span>
                  <SearchableCombobox
                    ariaLabel="Target role"
                    options={TARGET_ROLES.map((r) => r.label)}
                    value={targetRole}
                    onChange={setTargetRole}
                    searchable
                    filter={(q) => searchRoles(q).map((r) => r.label)}
                    customTriggerLabel={CUSTOM_ROLE_LABEL}
                    placeholder="Search a role…"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-ink">Candidate level</span>
                  <SearchableCombobox
                    ariaLabel="Candidate level"
                    options={CANDIDATE_LEVELS}
                    value={candidateLevel}
                    onChange={setCandidateLevel}
                    searchable={false}
                    customTriggerLabel={CUSTOM_LEVEL_LABEL}
                    placeholder="Select a level…"
                  />
                </label>
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink">Optional job description</span>
                <TextArea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste the role requirements to tune the validation contract." />
              </label>
              <div className="grid gap-2 md:grid-cols-3">
                {ROLE_WEIGHTS.map(([skill, weight]) => (
                  <div key={skill} className="rounded-md border border-border bg-panel2/35 p-3">
                    <div className="text-sm font-semibold text-ink">{skill}</div>
                    <div className="mt-1 font-mono text-xs text-muted">weight {weight}</div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Execution mode and provider readiness</CardTitle>
            </CardHeader>
            <CardBody className="space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                {(Object.keys(MODE_LABELS) as ExecutionMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setExecutionMode(mode)}
                    className={cn(
                      "rounded-md border p-3 text-left transition",
                      executionMode === mode ? "border-accent bg-accent/10" : "border-border bg-panel2/35 hover:border-accent/50",
                    )}
                  >
                    <div className="text-sm font-semibold text-ink">{MODE_LABELS[mode].label}</div>
                    <p className="mt-1 text-xs text-muted">{MODE_LABELS[mode].detail}</p>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={readiness?.ok ? "good" : "bad"}>{readinessLoading ? "checking providers" : readiness?.ok ? "providers ready" : "provider_not_ready"}</Badge>
                <span className="text-xs text-muted">{MODE_LABELS[executionMode].required}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => fetchReadiness(executionMode)} disabled={readinessLoading}>
                  Run readiness check
                </Button>
              </div>
              {readiness?.blockers?.length ? (
                <div className="space-y-2">
                  {readiness.blockers.map((b, i) => (
                    <div key={`${b.providerId}-${b.agentName}-${i}`} className="rounded-md border border-bad/30 bg-bad/10 p-3 text-sm">
                      <div className="font-semibold text-bad">{b.agentName ? `${b.agentName}: ` : ""}{b.providerId}</div>
                      <p className="mt-1 text-ink">{b.reason}</p>
                      <p className="mt-1 text-xs text-muted">{b.fix}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(readiness?.providers ?? []).map((p) => (
                  <div key={p.provider_id} className="rounded-md border border-border bg-panel2/35 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-xs text-ink">{p.provider_id}</div>
                      <Badge tone={readinessTone(p.status)}>{p.status}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted">
                      <span>enabled: {p.enabled ? "yes" : "no"}</span>
                      <span>auth: {p.authenticated ? "yes" : "no"}</span>
                      <span>json: {p.supports_json ? "yes" : "no"}</span>
                      <span>non-interactive: {p.supports_non_interactive ? "yes" : "no"}</span>
                      <span>reasoning: {p.supports_reasoning_budget ? "yes" : "no"}</span>
                      <span>{p.latency_ms != null ? `${p.latency_ms}ms` : "latency unknown"}</span>
                    </div>
                    {p.configured_model && <p className="mt-2 font-mono text-xs text-muted">{p.configured_model}</p>}
                    {p.last_error && <p className="mt-2 text-xs text-bad">{p.last_error}</p>}
                    {!p.authenticated || !p.installed || p.status !== "ready" ? <p className="mt-2 text-xs text-muted">{p.fix}</p> : null}
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle>Local proof safety</CardTitle>
            </CardHeader>
            <CardBody className="space-y-5">
              <div className="rounded-md border border-border bg-panel2/35 p-4 text-sm text-muted">
                Terminal proof runs only in a run-scoped workspace with an allowlist, timeouts, truncation, secret redaction, command hashes, and audit logs. Skipped commands are recorded as skipped and never counted as passed proof.
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {["git log/status", "install if approved", "test", "build", "typecheck", "lint", "security grep"].map((cmd) => (
                  <div key={cmd} className="rounded-md border border-border bg-bg/45 p-3 font-mono text-xs text-ink">{cmd}</div>
                ))}
              </div>
              <label className="flex items-start gap-3 rounded-md border border-accent/30 bg-accent/10 p-4 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={installApproved}
                  onChange={(e) => setInstallApproved(e.target.checked)}
                  disabled={executionMode === "api"}
                />
                <span>
                  I approve dependency installation only if the proof runner needs it. Install commands still use the allowlist and timeout policy. In API mode this is not used.
                </span>
              </label>
              {executionMode === "api" ? (
                <EmptyPanel detail="API mode will not run terminal proof during mission start. Terminal dimensions remain not measured unless proof is added later from the sandbox terminal." />
              ) : (
                <EmptyPanel detail="Local proof will clone into `.skillproof/runs/<run_id>`. Destructive commands, env dumps, SSH key access, and arbitrary shell execution are blocked." />
              )}
            </CardBody>
          </Card>
        )}

        {step === 6 && (
          <Card>
            <CardHeader>
              <CardTitle>Start mission</CardTitle>
            </CardHeader>
            <CardBody className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <InfoBox label="Repository" value={parsedRepo ? `${parsedRepo.owner}/${parsedRepo.repo}` : "invalid"} detail={repoUrl || "not supplied"} />
                <InfoBox label="Role" value={targetRole} detail={candidateLevel} />
                <InfoBox label="Execution mode" value={MODE_LABELS[executionMode].label} detail={readiness?.ok ? "provider checks passed" : "provider checks blocked"} />
                <InfoBox label="Ownership" value={strongestOwnership} detail={ownershipChallenge ? `challenge ${ownershipChallenge.challenge_id} linked before run` : "no server token"} />
              </div>
              {startError && (
                <pre className="whitespace-pre-wrap rounded-md border border-bad/30 bg-bad/10 p-3 text-xs text-bad">{startError}</pre>
              )}
              {!readiness?.ok && (
                <EmptyPanel detail="Mission start is blocked until all required providers pass readiness checks. This prevents fake or heuristic scores from being created." />
              )}
              <Button type="button" size="lg" onClick={startMission} disabled={starting || !parsedRepo || !readiness?.ok}>
                {starting ? "Starting mission..." : "Start evidence mission"}
              </Button>
            </CardBody>
          </Card>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
            Back
          </Button>
          {step < 6 ? (
            <Button type="button" onClick={() => setStep((s) => Math.min(6, s + 1))} disabled={!canAdvance}>
              Continue
            </Button>
          ) : (
            <span className="text-xs text-muted">A created run opens the live proof command center automatically.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoBox({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-border bg-panel2/35 p-3">
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-ink">{value}</div>
      {detail && <div className="mt-1 break-words text-xs text-muted">{detail}</div>}
    </div>
  );
}

function EmptyPanel({ detail }: { detail: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-bg/35 p-4 text-sm text-muted">
      {detail}
    </div>
  );
}
