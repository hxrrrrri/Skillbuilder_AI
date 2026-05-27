import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { RoleShell } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CANDIDATE_NAV } from "../_nav";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default async function CandidateSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/candidate/settings");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, email: true, githubUsername: true, role: true },
  });

  return (
    <RoleShell
      title="Settings"
      subtitle="Profile, password, and account deletion."
      navLinks={CANDIDATE_NAV}
      activeHref="/candidate/settings"
    >
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardBody>
          <SettingsForm
            initialName={dbUser?.name ?? ""}
            initialGithubUsername={dbUser?.githubUsername ?? ""}
            email={dbUser?.email ?? ""}
            githubOauthEnabled={
              !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET
            }
            googleOauthEnabled={
              !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
            }
          />
        </CardBody>
      </Card>
    </RoleShell>
  );
}
