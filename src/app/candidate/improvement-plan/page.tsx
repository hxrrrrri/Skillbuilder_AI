import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImprovementPlanCard } from "@/components/improvement-plan";
import { CANDIDATE_NAV } from "../_nav";

export const dynamic = "force-dynamic";

type Plan = {
  seven_day: string[];
  thirty_day: Array<{ week: number; title: string; detail: string; files?: string[] }>;
  recommended_tests: string[];
  git_hygiene: string[];
};

export default async function ImprovementPlanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/candidate/improvement-plan");

  const candidate = await prisma.candidate.findUnique({ where: { userId: user.id } });
  const runs = await prisma.analysisRun.findMany({
    where: {
      OR: [
        candidate ? { candidateId: candidate.id } : { id: "__none__" },
        { createdByUserId: user.id },
      ],
      status: "completed",
      improvementPlan: { not: null },
    },
    orderBy: { createdAt: "desc" },
    include: { repository: true },
  });

  return (
    <RoleShell
      title="Improvement plan"
      subtitle="Where to invest the next 30 days. Linked back to the files that drove the recommendation."
      navLinks={CANDIDATE_NAV}
      activeHref="/candidate/improvement-plan"
    >
      {runs.length === 0 ? (
        <Card>
          <CardBody>
            <ScaffoldNotice detail="No completed runs with an improvement plan yet. Finish a verification first." />
          </CardBody>
        </Card>
      ) : (
        runs.map((run) => {
          const plan = safeJsonParse<Plan | null>(run.improvementPlan, null);
          const repoUrl = run.repository.repoUrl;
          const branch = "main";
          const fileLink = (file: string) => {
            try {
              return `${repoUrl.replace(/\.git$/, "")}/blob/${branch}/${file}`;
            } catch {
              return null;
            }
          };
          return (
            <Card key={run.id}>
              <CardHeader>
                <CardTitle>
                  {run.repository.owner}/{run.repository.repoName}
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge>{run.targetRole}</Badge>
                  {run.overallScore != null && <Badge tone="accent">overall {run.overallScore}</Badge>}
                  <Link href={`/mission/${run.id}`} className="text-accent hover:underline">
                    open mission ↗
                  </Link>
                </div>
                {plan ? (
                  <>
                    <ImprovementPlanCard data={plan} />
                    {plan.thirty_day?.some((w) => w.files?.length) && (
                      <div className="rounded border border-border bg-panel2/40 p-3 text-xs">
                        <div className="mb-1 font-semibold text-ink">File targets ↦ repo</div>
                        <ul className="space-y-1">
                          {plan.thirty_day.flatMap((w) =>
                            (w.files ?? []).map((f) => {
                              const url = fileLink(f);
                              return (
                                <li key={`${w.week}-${f}`} className="flex items-center gap-2">
                                  <Badge>week {w.week}</Badge>
                                  {url ? (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-mono text-accent hover:underline"
                                    >
                                      {f}
                                    </a>
                                  ) : (
                                    <span className="font-mono text-muted">{f}</span>
                                  )}
                                </li>
                              );
                            }),
                          )}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <ScaffoldNotice detail="No improvement plan JSON on this run." />
                )}
              </CardBody>
            </Card>
          );
        })
      )}
    </RoleShell>
  );
}
