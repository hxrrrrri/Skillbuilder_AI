"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import heroCv from "../../public/hero-cv.png";
import { Button } from "@/components/ui/button";
import { Input, TextArea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SectionPictogram, VerificationChecklist, AuditMagnifying, VerifyBadge } from "@/components/brand/skillproof-mark";

const SAMPLE_REPOS = [
  "https://github.com/vercel/next.js",
  "https://github.com/anthropics/anthropic-cookbook",
  "https://github.com/openai/openai-python",
];

type Mode = "api" | "cli" | "hybrid" | "local";

function useCounter(target: number, duration: number, active: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    let current = 0;
    const steps = Math.ceil(duration / 16);
    const increment = target / steps;
    const timer = setInterval(() => {
      current = Math.min(current + increment, target);
      setCount(Math.floor(current));
      if (current >= target) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration, active]);
  return count;
}

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

  const statsRef = useRef<HTMLDivElement>(null);
  const [statsVisible, setStatsVisible] = useState(false);
  const agentCount = useCounter(13, 1200, statsVisible);

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

  useEffect(() => {
    const els = document.querySelectorAll(".reveal, .reveal-up, .reveal-left, .reveal-right");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
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
    <div className="space-y-28">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="border-b border-border pb-20 pt-4 text-center">
        <div className="mx-auto flex max-w-4xl flex-col items-center">
          <div className="reveal badge-glow mb-8 inline-flex">
            <Badge tone="accent" className="px-5 py-2 text-sm font-medium tracking-wide">
              Proof-of-work hiring infrastructure
            </Badge>
          </div>

          <div className="float-gentle">
            <Image
              src={heroCv}
              alt="CV to code"
              priority
              sizes="(max-width: 768px) 100vw, 520px"
              className="mb-8 h-auto w-full max-w-[520px] object-contain"
            />
          </div>

          <h1 className="reveal max-w-4xl font-display text-5xl font-medium leading-[1.05] text-ink md:text-6xl lg:text-7xl">
            Turn real GitHub work into{" "}
            <span className="text-gradient">verified hiring evidence.</span>
          </h1>

          <p className="reveal stagger-1 mt-7 max-w-2xl text-lg leading-9 text-body md:text-xl">
            SkillProof runs specialist agents against a candidate repo, audits every score with a
            fresh-context validator, and publishes a credibility profile employers can inspect.
          </p>

          <div className="reveal stagger-2 mt-8 flex flex-wrap justify-center gap-2">
            {["Validation contract first", "Creator-verifier separation", "Evidence locker", "Own-code interview"].map(
              (t) => (
                <Badge key={t} className="px-4 py-1.5 text-sm">
                  {t}
                </Badge>
              )
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div
          ref={statsRef}
          className="reveal mx-auto mt-16 grid max-w-4xl overflow-hidden rounded-2xl border border-border sm:grid-cols-3"
          style={{ gap: "1px", background: "#3d3d3a" }}
        >
          {[
            { value: agentCount, suffix: "", label: "specialist agents" },
            { value: 100, suffix: "%", label: "file-backed claims" },
            { value: 1, suffix: "", label: "shareable profile" },
          ].map(({ value, suffix, label }, i) => (
            <div
              key={label}
              className="group relative overflow-hidden bg-panel px-8 py-9 text-left transition-colors duration-500 hover:bg-panel2"
              style={{
                borderRadius:
                  i === 0
                    ? "calc(1rem - 1px) 0 0 calc(1rem - 1px)"
                    : i === 2
                    ? "0 calc(1rem - 1px) calc(1rem - 1px) 0"
                    : undefined,
              }}
            >
              <div
                className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{
                  background: "radial-gradient(circle at 30% 50%, rgba(217,119,87,0.07) 0%, transparent 70%)",
                }}
              />
              <div className="tabular relative font-display text-5xl font-medium text-ink">
                {statsVisible ? value : 0}
                {suffix}
              </div>
              <div className="relative mt-2 text-sm uppercase tracking-widest text-muted">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Start Verification ───────────────────────────────── */}
      <section id="start-verification" className="grid gap-14 lg:grid-cols-12 lg:items-start">
        {/* Left: explanation */}
        <div className="reveal-left lg:col-span-5">
          <VerificationChecklist className="mb-7 h-16 w-16 text-accent" />
          <h2 className="max-w-xl font-display text-4xl font-medium leading-tight text-ink md:text-5xl">
            Start a verification mission
          </h2>
          <p className="mt-5 max-w-xl text-base leading-9 text-body">
            Paste a public repo and SkillProof will build the evidence pack automatically — architecture,
            code quality, security, git evidence, docs, and authenticity.
          </p>
          <div className="mt-10 overflow-x-auto rounded-xl border border-border bg-panel/80 p-6 backdrop-blur-sm">
            <pre className="font-mono text-sm leading-7">
              <code>
                <span className="text-muted">{"const "}</span>
                <span className="text-ink">{"mission"}</span>
                <span className="text-muted">{" = await "}</span>
                <span className="text-accent">{"skillproof"}</span>
                <span className="text-muted">{"."}</span>
                <span className="text-good">{"verify"}</span>
                <span className="text-muted">{"({"}</span>
                {"\n  "}
                <span className="text-body">{"repo"}</span>
                <span className="text-muted">{": "}</span>
                <span className="text-warn">{"\"github.com/owner/repo\""}</span>
                {",\n  "}
                <span className="text-body">{"contract"}</span>
                <span className="text-muted">{": "}</span>
                <span className="text-warn">{"\"role-fit-first\""}</span>
                {",\n  "}
                <span className="text-body">{"validator"}</span>
                <span className="text-muted">{": "}</span>
                <span className="text-warn">{"\"fresh-context\""}</span>
                {",\n  "}
                <span className="text-body">{"output"}</span>
                <span className="text-muted">{": "}</span>
                <span className="text-warn">{"\"public-profile\""}</span>
                {",\n"}
                <span className="text-muted">{"})"}</span>
              </code>
            </pre>
          </div>
          <div className="relative top-4 mt-10 pl-24">
            <Image
              src="/lapguy.png"
              alt="Developer working on a laptop"
              width={420}
              height={320}
              sizes="(max-width: 1024px) 45vw, 420px"
              className="h-auto w-full max-w-[320px] object-contain"
            />
          </div>
        </div>

        {/* Right: form card */}
        <div className="reveal-right lg:col-span-7">
          <div
            className="overflow-hidden rounded-2xl border border-border bg-panel/70 backdrop-blur-md"
            style={{ boxShadow: "0 32px 80px -20px rgba(0,0,0,0.65), 0 0 0 1px rgba(61,61,58,0.5)" }}
          >
            {/* Window chrome */}
            <div className="flex items-center gap-2 border-b border-border bg-panel2/90 px-6 py-4">
              <span className="h-3 w-3 rounded-full bg-bad transition-transform hover:scale-110" />
              <span className="h-3 w-3 rounded-full bg-warn transition-transform hover:scale-110" />
              <span className="h-3 w-3 rounded-full bg-good transition-transform hover:scale-110" />
              <span className="ml-auto rounded-lg border border-border bg-bg/60 px-3 py-1 font-mono text-xs text-muted">
                mission.config.ts
              </span>
            </div>

            <div className="space-y-5 p-7">
              <div>
                <label className="mb-2 block text-sm font-semibold uppercase tracking-widest text-muted">
                  Public GitHub repo URL
                </label>
                <Input
                  placeholder="https://github.com/owner/repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold uppercase tracking-widest text-muted">
                    Your name
                  </label>
                  <Input
                    placeholder="Jane Dev"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold uppercase tracking-widest text-muted">
                    GitHub user{" "}
                    <span className="normal-case font-normal tracking-normal text-muted/60">(optional)</span>
                  </label>
                  <Input
                    placeholder="janedev"
                    value={githubUsername}
                    onChange={(e) => setGithubUsername(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold uppercase tracking-widest text-muted">
                    Target role
                  </label>
                  <Input value={role} onChange={(e) => setRole(e.target.value)} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold uppercase tracking-widest text-muted">
                    Level
                  </label>
                  <Input value={level} onChange={(e) => setLevel(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold uppercase tracking-widest text-muted">
                  Job description{" "}
                  <span className="normal-case font-normal tracking-normal text-muted/60">(optional)</span>
                </label>
                <TextArea
                  placeholder="Paste a JD to focus the rubric…"
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold uppercase tracking-widest text-muted">
                  Execution mode
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(["api", "cli", "hybrid", "local"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setExecutionMode(m)}
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-all duration-200 ${
                        executionMode === m
                          ? "border-accent/60 bg-accent/10 text-ink"
                          : "border-border bg-bg/40 text-muted hover:border-accent/40 hover:bg-accent/10 hover:text-ink"
                      }`}
                      style={
                        executionMode === m
                          ? { boxShadow: "0 0 20px rgba(217,119,87,0.12)" }
                          : undefined
                      }
                    >
                      {m === "api" && "Cloud API"}
                      {m === "cli" && "Local CLI"}
                      {m === "hybrid" && "Hybrid"}
                      {m === "local" && "Local"}
                    </button>
                  ))}
                </div>
                {(executionMode === "cli" || executionMode === "hybrid" || executionMode === "local") && (
                  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-bg/40 p-4 text-sm leading-7 text-muted transition-colors hover:border-accent/30">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#d97757]"
                      checked={localInstallApproved}
                      onChange={(e) => setLocalInstallApproved(e.target.checked)}
                    />
                    <span>
                      Approve dependency install for local proof. SkillProof will detect the lockfile,
                      run the safest install command, then run test/build/typecheck/lint when scripts exist.
                    </span>
                  </label>
                )}
                <div className="mt-3 flex items-center gap-2 text-sm text-muted">
                  {recommendedMode && (
                    <>
                      <span>
                        Recommended:{" "}
                        <span className="font-semibold text-accent">{recommendedMode}</span>
                      </span>
                      <span className="text-border">·</span>
                    </>
                  )}
                  <a href="/local-setup" className="text-accent transition-colors hover:text-ink">
                    Local setup ↗
                  </a>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-3 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-bad" />
                  {error}
                </div>
              )}

              <Button size="lg" className="w-full" onClick={start} disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Starting mission…
                  </span>
                ) : (
                  "Run SkillProof mission →"
                )}
              </Button>

              <div className="flex flex-wrap items-center gap-2 pt-1 text-sm text-muted">
                <span className="text-muted/60">Try:</span>
                {SAMPLE_REPOS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="rounded-lg border border-border bg-panel2/60 px-3 py-1.5 text-xs transition-all duration-200 hover:border-accent/40 hover:bg-accent/10 hover:text-ink"
                    onClick={() => setRepoUrl(r)}
                  >
                    {r.replace("https://github.com/", "")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Mission Architecture ─────────────────────────────── */}
      <section className="border-y border-border py-20">
        <div className="reveal mb-14">
          <div className="text-sm font-semibold uppercase tracking-widest text-accent">Mission architecture</div>
          <h2 className="mt-4 font-display text-4xl font-medium text-ink md:text-5xl">
            Contract, audit, verify.
          </h2>
        </div>

        <div className="space-y-3">
          {[
            {
              icon: "contract" as const,
              step: "01",
              label: "Orchestrate",
              title: "Validation contract first",
              detail:
                "The orchestrator writes the rubric before any analysis. Correctness is defined independently, before any scoring begins.",
            },
            {
              icon: "audit" as const,
              step: "02",
              label: "Audit",
              title: "Workers + validator",
              detail:
                "Architecture, code quality, testing, security, git evidence, docs, authenticity — each agent runs serially with structured handoffs. A separate validator audits every claim.",
            },
            {
              icon: "verify" as const,
              step: "03",
              label: "Verify",
              title: "Own-code interview",
              detail:
                "Own-code interview questions are generated from the candidate's code. Every score is backed by file evidence. The output is a shareable verified profile.",
            },
          ].map(({ icon, step, label, title, detail }, i) => (
            <div
              key={step}
              className={`reveal stagger-${i + 1} card-lift group grid gap-6 rounded-2xl border border-border/60 bg-panel/50 p-8 hover:border-border hover:bg-panel/80 md:grid-cols-[200px_1fr] md:items-center`}
            >
              <div className="flex items-center gap-5">
                <div className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-border bg-panel2 transition-colors group-hover:border-accent/30">
                  {icon === "contract" ? (
                    <VerificationChecklist className="text-muted transition-colors group-hover:text-accent" />
                  ) : icon === "audit" ? (
                    <AuditMagnifying className="text-muted transition-colors group-hover:text-accent" />
                  ) : icon === "verify" ? (
                    <VerifyBadge className="text-muted transition-colors group-hover:text-accent" />
                  ) : (
                    <SectionPictogram
                      type={icon}
                      className="h-6 w-6 text-muted transition-colors group-hover:text-accent"
                    />
                  )}
                </div>
                <div>
                  <div className="font-display text-3xl font-medium text-border transition-colors group-hover:text-accent/50">
                    {step}
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-accent">{label}</div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-[280px_1fr] md:items-center">
                <h3 className="font-display text-2xl font-medium leading-tight text-ink">{title}</h3>
                <p className="text-base leading-8 text-body">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── For Candidates + Employers ───────────────────────── */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div
          className="reveal-left card-lift relative overflow-hidden rounded-2xl border border-accent/40 p-10 text-bg"
          style={{ background: "linear-gradient(135deg, #d97757 0%, #c96442 100%)" }}
        >
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl"
            style={{ background: "rgba(255,255,255,0.1)" }}
          />
          <div
            className="pointer-events-none absolute bottom-0 left-0 h-40 w-full"
            style={{ background: "linear-gradient(to top, rgba(201,100,66,0.3), transparent)" }}
          />
          <div className="relative">
            <SectionPictogram type="account" className="mb-8 h-10 w-10 text-bg/70" />
            <div className="text-sm font-semibold uppercase tracking-widest text-bg/75">For candidates</div>
            <h2 className="mt-4 font-display text-4xl font-medium leading-tight text-bg md:text-5xl">
              Show the work behind the resume.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-8 text-bg/85">
              Walk employers through your real repo, verified scores, and own-code interview evidence.
              No more keyword bingo — let the proof speak.
            </p>
          </div>
        </div>

        <div className="reveal-right card-lift relative overflow-hidden rounded-2xl border border-border bg-panel/70 p-10 backdrop-blur-sm">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl"
            style={{ background: "rgba(217,119,87,0.06)" }}
          />
          <div className="relative">
            <SectionPictogram type="audit" className="mb-8 h-10 w-10 text-accent" />
            <div className="text-sm font-semibold uppercase tracking-widest text-accent">For employers</div>
            <h2 className="mt-4 font-display text-4xl font-medium leading-tight text-ink md:text-5xl">
              Inspect strengths, risks, and follow-ups.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-8 text-body">
              The verifier preview summarizes role fit, evidence quality, biggest risks, and suggested
              questions without hiding the underlying file references.
            </p>
          </div>
        </div>
      </section>

      {/* ── Campus link ──────────────────────────────────────── */}
      <section className="pb-6 text-center">
        <a
          href="/campus-preview"
          className="group inline-flex items-center gap-2 rounded-xl border border-border bg-panel/50 px-6 py-3 text-base font-semibold text-muted transition-all duration-300 hover:border-accent/40 hover:bg-panel/80 hover:text-ink"
        >
          Open Campus / Placement dashboard preview
          <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
        </a>
      </section>
    </div>
  );
}
