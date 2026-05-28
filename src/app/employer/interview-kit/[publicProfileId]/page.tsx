import { notFound, redirect } from "next/navigation";
import { getCurrentUser, requireRole } from "@/lib/auth/session";
import { getEmployerProfileBundle, summarizeEmployerProfile } from "@/lib/employer/profiles";
import { safeJsonParse } from "@/lib/utils";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EMPLOYER_NAV } from "../../_nav";
import { InterviewKitGenerateControl } from "./kit-control";

export const dynamic = "force-dynamic";

export default async function EmployerInterviewKitPage({
  params,
}: {
  params: { publicProfileId: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=/employer/interview-kit/${params.publicProfileId}`);
  await requireRole("employer");
  const bundle = await getEmployerProfileBundle(params.publicProfileId);
  if (!bundle) notFound();
  const summary = summarizeEmployerProfile(bundle);
  const kit = safeJsonParse<any>(bundle.interviewKit ?? null, null);

  return (
    <RoleShell
      title="Interview kit"
      subtitle={`${summary.candidateName} · ${summary.targetRole} · ${summary.repo}`}
      navLinks={EMPLOYER_NAV}
      activeHref="/employer/candidates"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Generated interview plan</CardTitle>
            <InterviewKitGenerateControl profileId={summary.id} defaultRole={summary.targetRole} />
          </div>
        </CardHeader>
        <CardBody>
          {!kit ? (
            <ScaffoldNotice detail="No interview kit generated yet. Generate one to cache project-specific questions on this profile." />
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge tone={kit.source === "deterministic" ? "good" : "accent"}>
                  {kit.source === "deterministic" ? "Deterministic evidence-derived" : "LLM generated"}
                </Badge>
                <Badge>{kit.target_role}</Badge>
                <Badge>{kit.model}</Badge>
                {summary.evaluatorVersion && <Badge>{summary.evaluatorVersion}</Badge>}
                {summary.evaluatedCommitSha && <Badge>{summary.evaluatedCommitSha.slice(0, 7)}</Badge>}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Metric label="Employer-safe evidence" value={summary.evidenceCount} />
                <Metric label="Terminal proof" value={summary.terminalProofCount} />
                <Metric label="AI collaboration" value={summary.aiCollabScore == null ? "Insufficient" : summary.aiCollabScore} />
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.trustBadges.map((badge) => <Badge key={badge}>{badge}</Badge>)}
              </div>
              <Section title="Project-specific" items={kit.sections?.project_specific ?? []} />
              <Section title="Debugging" items={kit.sections?.debugging ?? []} />
              <Section title="AI collaboration" items={kit.sections?.ai_collaboration ?? []} />
              <Section title="Red flags" items={kit.sections?.red_flags ?? []} />
              <Section title="Expected strong signals" items={kit.sections?.expected_strong_signals ?? []} />
            </div>
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="rounded-md border border-border bg-bg/55 p-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink">{value ?? "None"}</p>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-ink">
        {items.length ? items.map((item) => <li key={item}>{item}</li>) : <li className="text-muted">No items generated.</li>}
      </ol>
    </section>
  );
}
