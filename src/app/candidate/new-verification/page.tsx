import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { RoleShell } from "@/components/role-shell";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/candidate/dashboard", label: "Dashboard" },
  { href: "/candidate/new-verification", label: "New verification" },
  { href: "/candidate/runs", label: "Runs" },
  { href: "/candidate/profile", label: "Public profile" },
];

export default async function NewVerificationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/candidate/new-verification");
  return (
    <RoleShell
      title="Start a verification"
      subtitle="Submit a real GitHub repository you own. SkillProof will analyze, audit, and verify your work."
      navLinks={NAV}
      activeHref="/candidate/new-verification"
    >
      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm text-muted">
            The mission submission flow is hosted on the public landing page. It will pre-fill your
            candidate name and GitHub username from your account.
          </p>
          <a
            href="/?candidate=me"
            className="inline-flex items-center justify-center rounded-md border border-accent/70 bg-accent px-4 py-2 text-sm font-semibold text-cream shadow-glow hover:bg-[#ba654f]"
          >
            Open submission form →
          </a>
        </CardBody>
      </Card>
    </RoleShell>
  );
}
