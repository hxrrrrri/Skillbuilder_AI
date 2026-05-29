import Link from "next/link";
import { prisma } from "@/lib/db";
import { DEMO_PROFILE_SLUG, DEMO_REPO } from "@/lib/demo-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const DEMO_ACCOUNTS = [
  {
    label: "Candidate Demo",
    email: "candidate@skillproof.dev",
    href: "/login?callbackUrl=/candidate/dashboard",
    detail: "Start a run, inspect the seeded completed mission, answer own-code interview questions, and publish profiles.",
  },
  {
    label: "Employer Demo",
    email: "employer@skillproof.dev",
    href: "/login?callbackUrl=/employer/search",
    detail: "Search, filter, compare, shortlist, and generate an interview kit from public-safe evidence.",
  },
  {
    label: "College Demo",
    email: "college@skillproof.dev",
    href: "/login?callbackUrl=/college/dashboard",
    detail: "Inspect tenant-scoped cohorts, readiness, skill gaps, and employer share links without private data leakage.",
  },
  {
    label: "Admin Demo",
    email: "admin@skillproof.dev",
    href: "/login?callbackUrl=/admin/dashboard",
    detail: "Inspect providers, runs, evidence, audit logs, prompts, rubrics, terminal commands, and publish blockers.",
  },
];

export default async function DemoPage() {
  const profile = await prisma.publicProfile.findUnique({
    where: { slug: DEMO_PROFILE_SLUG },
    include: { run: { include: { repository: true, scores: true } } },
  });
  const run = profile?.run ?? null;
  const measured = run?.scores.filter((score) => score.score >= 0) ?? [];
  const notMeasured = run?.scores.filter((score) => score.score < 0).map((score) => score.skillName) ?? [];
  const completedRunHref = run
    ? `/login?callbackUrl=${encodeURIComponent(`/candidate/runs/${run.id}`)}`
    : "/login?callbackUrl=/candidate/dashboard";

  return (
    <div className="space-y-10">
      <section className="grid gap-8 border-b border-border pb-10 lg:grid-cols-[1fr_420px] lg:items-end">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">Judge Demo Mode</Badge>
            <Badge tone="warn">Seeded data is labeled</Badge>
            <Badge tone="good">Live run available</Badge>
          </div>
          <h1 className="mt-5 max-w-4xl font-display text-5xl font-medium leading-tight text-ink md:text-6xl">
            SkillProof AI verifies developer skill from real evidence, not resume claims.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-muted">
            Problem: resumes and coding puzzles do not prove real building skill. Solution: SkillProof turns GitHub,
            terminal proof, ownership, own-code interviews, AI-collaboration challenges, and validator notes into a
            trust-safe profile.
          </p>
        </div>
        <Card className="border-accent/35 bg-accent/10">
          <CardHeader>
            <CardTitle>Demo data boundary</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-sm text-muted">
            <p>
              The seeded completed run is intentionally marked as demo data so judges can inspect the full product
              immediately. It is not presented as a live verification.
            </p>
            <p>
            Seeded walkthrough profiles stay private. Public trust labels require real provider-backed evidence, source,
            confidence, validator notes, provider matrix, validation summary, and ownership status to pass publish gates.
            </p>
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        {DEMO_ACCOUNTS.map((account) => (
          <Link key={account.email} href={account.href} className="group rounded-lg border border-border bg-panel/82 p-4 shadow-card transition hover:border-accent/60 hover:bg-panel2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-medium text-ink">{account.label}</h2>
              <span className="text-accent transition group-hover:translate-x-1">-&gt;</span>
            </div>
            <p className="mt-2 font-mono text-[11px] text-accent">{account.email}</p>
            <p className="mt-3 text-sm leading-6 text-muted">{account.detail}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Run full verification demo</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Seeded run" value={run?.status ?? "missing"} tone={run?.status === "completed" ? "good" : "warn"} />
              <Metric label="Measured scores" value={String(measured.length)} />
              <Metric label="Not measured" value={String(notMeasured.length)} tone={notMeasured.length ? "warn" : "good"} />
            </div>
            <p className="text-sm leading-6 text-muted">
              Inspect the completed command center for provider routing, repo intelligence, evidence locker, validator
              capping, terminal proof, ownership status, interview evidence, AI collaboration, and profile generation.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href={completedRunHref} className="rounded-md border border-accent/70 bg-accent px-4 py-2 text-sm font-semibold text-bg shadow-glow">
                Open completed run
              </Link>
              <Link href={`/profile/${DEMO_PROFILE_SLUG}`} className="rounded-md border border-border bg-panel px-4 py-2 text-sm font-semibold text-ink hover:border-accent/60">
                Open private draft profile
              </Link>
              <Link href="/demo/checklist" className="rounded-md border border-border bg-panel px-4 py-2 text-sm font-semibold text-muted hover:border-accent/60 hover:text-ink">
                Demo checklist
              </Link>
              <Link href="/report/casey-candidate-skillproof-ai-demo" className="rounded-md border border-border bg-panel px-4 py-2 text-sm font-semibold text-muted hover:border-accent/60 hover:text-ink">
                Open report
              </Link>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live run path</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="rounded-md border border-border bg-bg/45 p-3 font-mono text-xs text-muted">
              Demo repo: {DEMO_REPO.owner}/{DEMO_REPO.name}
            </div>
            <p className="text-sm leading-6 text-muted">
              To analyze a real repository, sign in as the candidate, start a new verification, issue the ownership
              challenge, check provider readiness, choose API/CLI/hybrid/local mode, and start the mission.
            </p>
            <Link href="/login?callbackUrl=/candidate/new-verification" className="inline-flex rounded-md border border-border bg-panel px-4 py-2 text-sm font-semibold text-ink hover:border-accent/60">
              Start live repository verification
            </Link>
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Checklist
          title="Trust gates"
          items={[
            "No mock or heuristic score sources",
            "Missing evidence remains not_measured",
            "Ownership is verified before public trust labels",
            "Public report excludes raw prompts, private answers, and terminal output",
          ]}
        />
        <Checklist
          title="Evidence surfaces"
          items={[
            "Repo intelligence map",
            "Searchable evidence locker",
            "Why this score panels",
            "What is not measured section",
          ]}
        />
        <Checklist
          title="Judge script"
          items={[
            "Use seeded account buttons on login",
            "Inspect completed run first",
            "Start a live run second",
            "Compare employer, college, and admin views",
          ]}
        />
      </section>
    </div>
  );
}

function Metric({ label, value, tone = "accent" }: { label: string; value: string; tone?: "accent" | "good" | "warn" }) {
  return (
    <div className="rounded-md border border-border bg-panel2/45 p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={tone === "good" ? "mt-1 font-mono text-lg text-good" : tone === "warn" ? "mt-1 font-mono text-lg text-warn" : "mt-1 font-mono text-lg text-accent"}>
        {value}
      </div>
    </div>
  );
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        <ul className="space-y-2 text-sm text-muted">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1 h-2 w-2 rounded-full bg-accent" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
