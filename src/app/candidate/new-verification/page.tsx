import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { RoleShell } from "@/components/role-shell";
import { CANDIDATE_NAV as NAV } from "../_nav";
import { NewVerificationWizard } from "./verification-wizard";

export const dynamic = "force-dynamic";

export default async function NewVerificationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/candidate/new-verification");

  const candidate = await prisma.candidate.findUnique({
    where: { userId: user.id },
    select: { name: true, email: true, githubUsername: true },
  });

  return (
    <RoleShell
      title="New verification mission"
      subtitle="Turn a real GitHub repository into evidence-backed hiring proof. No mock scoring, no silent fallback."
      navLinks={NAV}
      activeHref="/candidate/new-verification"
    >
      <NewVerificationWizard
        user={{
          id: user.id,
          name: candidate?.name || user.name || "Candidate",
          email: candidate?.email || user.email,
          role: user.role,
          githubUsername: candidate?.githubUsername ?? "",
        }}
      />
    </RoleShell>
  );
}
