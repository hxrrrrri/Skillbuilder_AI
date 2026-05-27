import { requireAdminPage } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody } from "@/components/ui/card";
import { ADMIN_NAV } from "../_nav";
import { ProfileRow } from "./row";

export const dynamic = "force-dynamic";

export default async function AdminProfilesPage() {
  await requireAdminPage("/admin/profiles");

  const profiles = await prisma.publicProfile.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      run: { include: { repository: true } },
      candidate: true,
      owner: true,
    },
  });

  return (
    <RoleShell
      title="Profiles moderation"
      subtitle="Toggle visibility, unpublish, and audit every public verified profile."
      navLinks={ADMIN_NAV}
      activeHref="/admin/profiles"
    >
      <Card>
        <CardBody>
          {profiles.length === 0 ? (
            <ScaffoldNotice detail="No profiles have been published yet." />
          ) : (
            <ul className="divide-y divide-border">
              {profiles.map((p) => (
                <ProfileRow
                  key={p.id}
                  id={p.id}
                  slug={p.slug}
                  visibility={p.visibility}
                  ownerEmail={p.owner?.email ?? null}
                  candidateName={p.candidate?.name ?? null}
                  repo={`${p.run.repository.owner}/${p.run.repository.repoName}`}
                  runId={p.runId}
                  createdAt={p.createdAt.toISOString()}
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}
