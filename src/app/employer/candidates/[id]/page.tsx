import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getEmployerProfileBundle, summarizeEmployerProfile } from "@/lib/employer/profiles";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EMPLOYER_NAV } from "../../_nav";
import { AddToShortlistControl } from "./shortlist-control";

export const dynamic = "force-dynamic";

export default async function EmployerCandidateDetail({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=/employer/candidates/${params.id}`);

  const bundle = await getEmployerProfileBundle(params.id);
  if (!bundle) notFound();
  const summary = summarizeEmployerProfile(bundle);
  const shortlists = await prisma.employerShortlist.findMany({
    where: { ownerUserId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });

  return (
    <RoleShell
      title={summary.candidateName}
      subtitle={`${summary.targetRole} · ${summary.repo}`}
      navLinks={EMPLOYER_NAV}
      activeHref="/employer/candidates"
    >
      <div className="flex flex-wrap gap-2">
        <Badge tone={summary.recommendation === "strong" ? "good" : summary.recommendation === "risky" ? "bad" : "warn"}>
          {summary.recommendation.replace(/_/g, " ")}
        </Badge>
        {summary.overallScore != null && <Badge tone="accent">Score {summary.overallScore}</Badge>}
        <Badge tone={summary.ownership === "verified" ? "good" : "warn"}>ownership: {summary.ownership}</Badge>
        {summary.mockOrHeuristic && <Badge tone="warn">Mock / heuristic signals present</Badge>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trust layer</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {summary.trustBadges.map((badge) => (
              <Badge
                key={badge}
                tone={badge.includes("Warning") ? "warn" : badge.includes("Verified") || badge.includes("Evidence") ? "good" : "default"}
              >
                {badge}
              </Badge>
            ))}
          </div>
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-4">
            <Metric label="Evidence count" value={summary.evidenceCount} />
            <Metric label="Terminal proof" value={summary.terminalProofCount} />
            <SmallMetric label="Commit" value={summary.evaluatedCommitSha ? summary.evaluatedCommitSha.slice(0, 12) : "not captured"} />
            <SmallMetric label="Evaluator" value={summary.evaluatorVersion ?? "not captured"} />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Hiring readout</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-3 md:grid-cols-3">
              <Metric label="Testing" value={summary.scores.Testing} />
              <Metric label="Debugging" value={summary.scores.Debugging} />
              <Metric label="Communication" value={summary.scores.Communication} />
              <Metric label="AI collaboration" value={summary.aiCollabScore} />
              <Metric label="Security" value={summary.scores.Security} />
              <Metric label="Documentation" value={summary.scores.Documentation} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evidence highlights</CardTitle>
            </CardHeader>
            <CardBody>
              {summary.evidenceHighlights.length === 0 ? (
                <ScaffoldNotice detail="No evidence highlights were persisted for this profile yet." />
              ) : (
                <ul className="space-y-2 text-sm">
                  {summary.evidenceHighlights.map((e, i) => (
                    <li key={i} className="rounded-md border border-border bg-panel2/40 p-3">
                      {e.file && <div className="mb-1 font-mono text-xs text-muted">{e.file}</div>}
                      <div className="text-ink">{e.reason}</div>
                      {e.source && <Badge className="mt-2">{e.source}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Biggest risks</CardTitle>
            </CardHeader>
            <CardBody>
              {summary.biggestRisks.length === 0 ? (
                <ScaffoldNotice detail="No risk signals were persisted. This is not a guarantee; it only means the current run did not store risk notes." />
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                  {summary.biggestRisks.map((risk) => <li key={risk}>{risk}</li>)}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <AddToShortlistControl profileId={summary.id} shortlists={shortlists} />
              <Link href={`/employer/interview-kit/${summary.id}`} className="block rounded-md border border-border px-3 py-2 text-center text-sm text-ink hover:border-accent/60">
                Generate interview kit
              </Link>
              <Link href={`/profile/${summary.slug}`} className="block rounded-md border border-border px-3 py-2 text-center text-sm text-muted hover:border-accent/60">
                Open public profile
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Follow-up questions</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
                <li>Ask them to explain one high-confidence evidence item from memory.</li>
                <li>Ask for a debugging story tied to the weakest measured skill.</li>
                <li>Ask how they reviewed AI-generated changes before merging.</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </RoleShell>
  );
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-md border border-border bg-panel2/40 p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 font-display text-3xl text-ink">{value == null ? "not measured" : value}</div>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-panel2/40 p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 break-all font-mono text-sm text-ink">{value}</div>
    </div>
  );
}
