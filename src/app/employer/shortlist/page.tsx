import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { summarizeEmployerProfile } from "@/lib/employer/profiles";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EMPLOYER_NAV } from "../_nav";
import { ShortlistCreateControl, ShortlistRemoveItemControl } from "./shortlist-controls";

export const dynamic = "force-dynamic";

export default async function EmployerShortlistPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/employer/shortlist");

  const shortlists = await prisma.employerShortlist.findMany({
    where: { ownerUserId: user.id },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });
  const activeId = searchParams.id ?? shortlists[0]?.id;
  const active = activeId
    ? await prisma.employerShortlist.findFirst({
        where: { id: activeId, ownerUserId: user.id },
        include: {
          items: {
            orderBy: [{ position: "asc" }, { addedAt: "asc" }],
            include: {
              profile: {
                include: {
                  candidate: { select: { name: true, githubUsername: true } },
                  run: {
                    include: {
                      repository: true,
                      scores: true,
                      questions: { select: { answer: true, answerScore: true } },
                    },
                  },
                },
              },
            },
          },
        },
      })
    : null;
  const compareIds = active?.items.slice(0, 5).map((i) => i.publicProfileId).join(",");

  return (
    <RoleShell
      title="Shortlists"
      subtitle="Organize verified candidates for hiring decisions."
      navLinks={EMPLOYER_NAV}
      activeHref="/employer/shortlist"
    >
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <ShortlistCreateControl />
            <div className="space-y-2">
              {shortlists.map((s) => (
                <Link
                  key={s.id}
                  href={`/employer/shortlist?id=${s.id}`}
                  className={`block rounded-md border px-3 py-2 text-sm ${
                    activeId === s.id ? "border-accent bg-panel2 text-ink" : "border-border text-muted"
                  }`}
                >
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs">{s.items.length} candidates</div>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{active?.name ?? "No shortlist selected"}</CardTitle>
              {compareIds && (
                <Link href={`/employer/compare?ids=${compareIds}`} className="rounded-md border border-border px-3 py-1.5 text-xs text-ink">
                  Compare first {Math.min(5, active?.items.length ?? 0)}
                </Link>
              )}
            </div>
          </CardHeader>
          <CardBody>
            {!active ? (
              <ScaffoldNotice detail="No shortlist exists yet. Create one, then add candidates from the candidate detail page." />
            ) : active.items.length === 0 ? (
              <ScaffoldNotice detail="This shortlist is empty. Add candidates from search results or candidate detail pages." />
            ) : (
              <div className="space-y-3">
                {active.items.map((item) => {
                  const profile = summarizeEmployerProfile(item.profile as any);
                  return (
                    <div key={item.id} className="rounded-md border border-border bg-panel2/40 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Link href={`/employer/candidates/${profile.id}`} className="font-display text-lg text-ink hover:text-accent">
                            {profile.candidateName}
                          </Link>
                          <div className="mt-1 text-xs text-muted">{profile.targetRole} · {profile.repo}</div>
                          {item.note && <div className="mt-2 text-xs text-muted">{item.note}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          {profile.overallScore != null && <Badge tone="accent">{profile.overallScore}</Badge>}
                          <Badge tone={profile.recommendation === "strong" ? "good" : profile.recommendation === "risky" ? "bad" : "warn"}>
                            {profile.recommendation.replace(/_/g, " ")}
                          </Badge>
                          <ShortlistRemoveItemControl shortlistId={active.id} itemId={item.id} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </RoleShell>
  );
}
