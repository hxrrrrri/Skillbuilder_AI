import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AcceptInviteForm } from "./accept-invite-form";

export const dynamic = "force-dynamic";

export default async function AcceptInvitePage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token ?? "";
  const user = await getCurrentUser();
  const invite = token
    ? await prisma.tenantInvite.findUnique({ where: { token }, include: { tenant: true, cohort: true } })
    : null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <div>
        <h1 className="font-display text-3xl text-ink">Accept college invite</h1>
        <p className="mt-1 text-sm text-muted">Join a tenant and, when included, a cohort roster.</p>
      </div>
      {!token || !invite ? (
        <ScaffoldNotice title="Invite unavailable" detail="The invite token is missing or does not exist." />
      ) : invite.acceptedAt ? (
        <ScaffoldNotice title="Invite already accepted" detail="This single-use invite has already been accepted." />
      ) : invite.expiresAt < new Date() ? (
        <ScaffoldNotice title="Invite expired" detail="Ask the college administrator to generate a new invite link." />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{invite.tenant.name}</CardTitle>
              <Badge tone="accent">{invite.role}</Badge>
            </div>
          </CardHeader>
          <CardBody>
            <p className="mb-4 text-sm text-muted">
              {invite.email} will be attached to {invite.tenant.name}
              {invite.cohort ? ` and the ${invite.cohort.name} cohort` : ""}.
            </p>
            {!user && (
              <p className="mb-4 text-sm text-muted">
                Already have an account? <Link href={`/login?callbackUrl=/accept-invite?token=${token}`} className="text-accent hover:text-ink">Sign in first</Link>.
              </p>
            )}
            <AcceptInviteForm token={token} signedIn={!!user} />
          </CardBody>
        </Card>
      )}
    </main>
  );
}
