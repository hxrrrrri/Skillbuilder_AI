import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkillRadar } from "@/components/skill-radar";
import { EvidencePanel } from "@/components/evidence-panel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PublicProfile({ params }: { params: { slug: string } }) {
  const profile = await prisma.publicProfile.findUnique({
    where: { slug: params.slug },
    include: {
      run: {
        include: {
          repository: true,
          scores: true,
          questions: true,
        },
      },
    },
  });

  if (!profile) return notFound();
  const run = profile.run;

  const scores = run.scores.map((s) => ({
    skill: s.skillName,
    score: s.score,
    confidence: s.confidence,
    evidence: safeJsonParse<any[]>(s.evidence, []),
  }));

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-border bg-panel/70 p-8 shadow-glow">
        <Badge tone="accent">Verified Profile</Badge>
        <h1 className="mt-3 text-3xl font-bold md:text-4xl">
          <span className="font-mono">{run.repository.owner}/{run.repository.repoName}</span>
        </h1>
        <div className="mt-3 flex flex-wrap items-end gap-6">
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
            <Badge tone="good">Validator audited</Badge>
          </div>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Skill Graph</CardTitle>
          </CardHeader>
          <CardBody>
            <SkillRadar data={scores.map((s) => ({ name: s.skill, score: s.score }))} />
          </CardBody>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Evidence</CardTitle>
          </CardHeader>
          <CardBody>
            <EvidencePanel scores={scores} />
          </CardBody>
        </Card>
      </section>

      {run.questions.some((q) => q.answer) && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Interview Performance</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {run.questions
                .filter((q) => q.answer)
                .map((q) => (
                  <div key={q.id} className="rounded-lg border border-border bg-panel/70 p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-ink">{q.question}</div>
                      {q.answerScore != null && <Badge tone="good">{q.answerScore}/100</Badge>}
                    </div>
                    {q.sourceFile && (
                      <div className="mt-1 text-xs font-mono text-muted">↳ {q.sourceFile}</div>
                    )}
                    <p className="mt-2 text-sm text-ink/80">{q.answer}</p>
                    {q.feedback && (
                      <p className="mt-2 text-xs italic text-muted">Validator: {q.feedback}</p>
                    )}
                  </div>
                ))}
            </CardBody>
          </Card>
        </section>
      )}

      <footer className="text-center text-xs text-muted">
        Verified by SkillProof AI — {new Date(profile.createdAt).toLocaleDateString()}
      </footer>
    </div>
  );
}
