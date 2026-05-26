import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkillRadar } from "@/components/skill-radar";
import { EvidenceLocker } from "@/components/evidence-locker";
import { AuthenticityCard } from "@/components/authenticity-card";
import { EmployerVerifier } from "@/components/employer-verifier";
import { ImprovementPlanCard } from "@/components/improvement-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PublicProfile({ params }: { params: { slug: string } }) {
  const profile = await prisma.publicProfile.findUnique({
    where: { slug: params.slug },
    include: {
      candidate: true,
      run: {
        include: {
          candidate: true,
          repository: true,
          scores: true,
          questions: true,
        },
      },
    },
  });

  if (!profile) return notFound();
  const run = profile.run;
  const candidate = run.candidate;

  const scores = run.scores.map((s) => ({
    skill: s.skillName,
    score: s.score === -1 ? null : s.score,
    confidence: s.confidence,
    source: s.scoreSource,
    evidence: safeJsonParse<any[]>(s.evidence, []),
    validator_notes: s.validatorNotes,
  }));

  const radarScores = scores
    .filter((s) => s.score != null && s.skill !== "Authenticity")
    .map((s) => ({ name: s.skill, score: s.score as number }));

  const authenticity = safeJsonParse<any>(run.authenticitySignals, null);
  const employer = safeJsonParse<any>(run.employerVerifier, null);
  const plan = safeJsonParse<any>(run.improvementPlan, null);
  const ai = safeJsonParse<any>(run.aiCollaboration, null);

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-border bg-panel/70 p-8 shadow-glow">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">Verified Profile</Badge>
          <Badge tone={run.verificationLevel === "repo_interview_verified" ? "good" : "default"}>
            {run.verificationLevel === "repo_interview_verified" ? "Repo + Interview verified" : "Repo-only verified"}
          </Badge>
          <Badge tone="good">Validator audited</Badge>
        </div>
        <h1 className="mt-3 text-3xl font-bold md:text-4xl">
          {candidate?.name ?? "Anonymous Candidate"}
        </h1>
        <div className="mt-2 text-sm text-muted">
          <span className="font-mono">{run.repository.owner}/{run.repository.repoName}</span>
          {candidate?.githubUsername && (
            <span className="ml-2 font-mono text-xs">· @{candidate.githubUsername}</span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Overall SkillProof</div>
            <div className="text-5xl font-bold">
              {run.overallScore ?? "—"}
              <span className="text-xl text-muted">/100</span>
            </div>
            <div className="text-sm text-muted">{run.roleFit}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{run.targetRole}</Badge>
            {run.candidateLevel && <Badge>{run.candidateLevel}</Badge>}
          </div>
        </div>
      </header>

      {radarScores.length > 0 && (
        <section className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Skill Graph</CardTitle>
            </CardHeader>
            <CardBody>
              <SkillRadar data={radarScores} />
            </CardBody>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Evidence Locker</CardTitle>
            </CardHeader>
            <CardBody>
              <EvidenceLocker scores={scores} />
            </CardBody>
          </Card>
        </section>
      )}

      {authenticity && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Authenticity Signals</CardTitle>
            </CardHeader>
            <CardBody>
              <AuthenticityCard data={authenticity} />
            </CardBody>
          </Card>
        </section>
      )}

      {run.questions.some((q) => q.answer) && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Interview Performance</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {run.questions
                .filter((q) => q.answer)
                .map((q) => {
                  const dim = safeJsonParse<any>(q.dimensionScores, null);
                  return (
                    <div key={q.id} className="rounded-lg border border-border bg-panel/70 p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-ink">{q.question}</div>
                        {q.answerScore != null && <Badge tone="good">{q.answerScore}/100</Badge>}
                      </div>
                      {q.sourceFile && (
                        <div className="mt-1 text-xs font-mono text-muted">↳ {q.sourceFile}</div>
                      )}
                      <p className="mt-2 text-sm text-ink/80">{q.answer}</p>
                      {dim && (
                        <div className="mt-2 grid grid-cols-2 gap-1 text-xs md:grid-cols-5">
                          {Object.entries(dim).map(([k, v]) => (
                            <div key={k} className="rounded border border-border px-2 py-1 text-center">
                              <div className="text-muted">{k.replace(/_/g, " ")}</div>
                              <div className="font-semibold text-ink">{v as number}/100</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {q.feedback && (
                        <p className="mt-2 text-xs italic text-muted">Validator: {q.feedback}</p>
                      )}
                    </div>
                  );
                })}
            </CardBody>
          </Card>
        </section>
      )}

      {ai && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>AI Collaboration Challenge</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="good">Overall {ai.overall_score}/100</Badge>
                <Badge>{ai.tool_used}</Badge>
              </div>
              <p className="mt-2 text-sm italic text-muted">{ai.feedback}</p>
            </CardBody>
          </Card>
        </section>
      )}

      {employer && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Employer Verifier</CardTitle>
            </CardHeader>
            <CardBody>
              <EmployerVerifier data={employer} />
            </CardBody>
          </Card>
        </section>
      )}

      {plan && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Improvement Plan</CardTitle>
            </CardHeader>
            <CardBody>
              <ImprovementPlanCard data={plan} />
            </CardBody>
          </Card>
        </section>
      )}

      <footer className="text-center text-xs text-muted">
        Verified by SkillProof AI · {new Date(profile.createdAt).toLocaleDateString()} ·{" "}
        <a className="text-accent hover:underline" href={`/api/report/export?run_id=${run.id}`}>
          Download Report.md
        </a>
      </footer>
    </div>
  );
}
