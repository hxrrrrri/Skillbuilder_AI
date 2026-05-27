import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CANDIDATE_NAV } from "../_nav";

export const dynamic = "force-dynamic";

export default async function CandidateRunsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/candidate/runs");

  const candidate = await prisma.candidate.findUnique({ where: { userId: user.id } });
  const runs = await prisma.analysisRun.findMany({
    where: {
      OR: [
        candidate ? { candidateId: candidate.id } : { id: "__none__" },
        { createdByUserId: user.id },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { repository: true },
  });

  return (
    <RoleShell
      title="Your verification runs"
      subtitle="Every analysis you have started, along with status and score."
      navLinks={CANDIDATE_NAV}
      activeHref="/candidate/runs"
    >
      <Card>
        <CardBody>
          {runs.length === 0 ? (
            <ScaffoldNotice detail="No runs yet. Start one from the New verification tab." />
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link
                      href={`/mission/${r.id}`}
                      className="font-mono text-sm text-ink hover:text-accent"
                    >
                      {r.repository.owner}/{r.repository.repoName}
                    </Link>
                    <div className="mt-0.5 text-xs text-muted">
                      {r.targetRole} · {new Date(r.createdAt).toLocaleString()} · {r.executionMode}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/candidate/interview/${r.id}`}
                      className="text-xs text-accent hover:underline"
                    >
                      interview
                    </Link>
                    <Link
                      href={`/candidate/ai-challenge/${r.id}`}
                      className="text-xs text-accent hover:underline"
                    >
                      ai-challenge
                    </Link>
                    <Link
                      href={`/candidate/runs/${r.id}/terminal`}
                      className="text-xs text-accent hover:underline"
                    >
                      terminal
                    </Link>
                    <Badge tone={r.status === "completed" ? "good" : r.status === "failed" ? "bad" : "warn"}>
                      {r.status}
                    </Badge>
                    {r.overallScore != null && (
                      <span className="font-mono text-sm text-ink">{r.overallScore}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}
