import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  EmployerSearchQuery,
  fetchPublicProfileBundles,
  filterEmployerSummaries,
  summarizeEmployerProfile,
} from "@/lib/employer/profiles";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EMPLOYER_NAV } from "../_nav";
import { SearchSaveControl } from "./search-save-control";

export const dynamic = "force-dynamic";

export default async function EmployerSearchPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/employer/search");

  const flat = Object.fromEntries(
    Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = EmployerSearchQuery.safeParse(flat);
  const filters = parsed.success ? parsed.data : EmployerSearchQuery.parse({});
  const where: Record<string, any> = {};
  if (filters.target_role) where.run = { ...(where.run ?? {}), targetRole: { contains: filters.target_role } };
  if (filters.min_score != null) where.run = { ...(where.run ?? {}), overallScore: { gte: filters.min_score } };
  if (filters.verification_level) where.run = { ...(where.run ?? {}), verificationLevel: filters.verification_level };
  if (filters.college_tenant_id) where.run = { ...(where.run ?? {}), tenantId: filters.college_tenant_id };

  const [bundles, savedSearches] = await Promise.all([
    fetchPublicProfileBundles(where, filters.limit),
    prisma.savedSearch.findMany({
      where: { ownerUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);
  const summaries = filterEmployerSummaries(bundles.map(summarizeEmployerProfile), filters).slice(0, filters.limit);
  const compareIds = summaries.slice(0, 5).map((s) => s.id).join(",");

  return (
    <RoleShell
      title="Search verified talent"
      subtitle="Filter public SkillProof profiles by evidence-backed signals."
      navLinks={EMPLOYER_NAV}
      activeHref="/employer/search"
    >
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardBody>
          <form className="grid gap-3 md:grid-cols-4" method="get">
            <Field name="target_role" label="Target role" defaultValue={flat.target_role} />
            <Field name="min_score" label="Min score" type="number" defaultValue={flat.min_score} />
            <Select
              name="verification_level"
              label="Verification"
              defaultValue={flat.verification_level}
              options={[
                ["", "Any"],
                ["repo_only", "Repo only"],
                ["repo_interview_verified", "Repo + interview"],
              ]}
            />
            <Select
              name="ownership_status"
              label="Ownership"
              defaultValue={flat.ownership_status}
              options={[
                ["", "Any"],
                ["verified", "Verified"],
                ["self_declared", "Self-declared"],
                ["unverified", "Unverified"],
              ]}
            />
            <Field name="skill" label="Skill name" defaultValue={flat.skill} />
            <Field name="skill_min" label="Skill min" type="number" defaultValue={flat.skill_min} />
            <Field name="risk" label="Risk contains" defaultValue={flat.risk} />
            <Field name="ai_collab_min" label="AI collab min" type="number" defaultValue={flat.ai_collab_min} />
            <Select
              name="interview_verified"
              label="Interview"
              defaultValue={flat.interview_verified}
              options={[
                ["", "Any"],
                ["true", "Verified"],
                ["false", "Not verified"],
              ]}
            />
            <Select
              name="terminal_proof"
              label="Terminal proof"
              defaultValue={flat.terminal_proof}
              options={[
                ["", "Any"],
                ["true", "Present"],
                ["false", "Absent"],
              ]}
            />
            <Field name="college_tenant_id" label="College tenant ID" defaultValue={flat.college_tenant_id} />
            <Field name="limit" label="Limit" type="number" defaultValue={flat.limit ?? "20"} />
            <div className="md:col-span-4 flex flex-wrap items-center gap-2">
              <button className="rounded-md border border-accent/70 bg-accent px-3 py-2 text-sm font-semibold text-cream shadow-glow">
                Search
              </button>
              <Link href="/employer/search" className="rounded-md border border-border px-3 py-2 text-sm text-muted">
                Clear
              </Link>
              <SearchSaveControl filters={flat} />
              {compareIds && (
                <Link href={`/employer/compare?ids=${compareIds}`} className="rounded-md border border-border px-3 py-2 text-sm text-ink">
                  Compare top {Math.min(5, summaries.length)}
                </Link>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader>
            <CardTitle>Results ({summaries.length})</CardTitle>
          </CardHeader>
          <CardBody>
            {summaries.length === 0 ? (
              <ScaffoldNotice detail="No public profiles match these filters. Published candidate profiles populate this search." />
            ) : (
              <div className="space-y-3">
                {summaries.map((s) => (
                  <div key={s.id} className="rounded-md border border-border bg-panel2/40 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link href={`/employer/candidates/${s.id}`} className="font-display text-lg text-ink hover:text-accent">
                          {s.candidateName}
                        </Link>
                        <div className="mt-1 text-xs text-muted">{s.targetRole} · {s.repo}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {s.overallScore != null && <Badge tone="accent">{s.overallScore}</Badge>}
                        <Badge tone={s.recommendation === "strong" ? "good" : s.recommendation === "risky" ? "bad" : "warn"}>
                          {s.recommendation.replace(/_/g, " ")}
                        </Badge>
                        <Badge tone={s.mockOrHeuristic ? "warn" : "default"}>
                          {s.mockOrHeuristic ? "Legacy unverified source" : "LLM / verified evidence"}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {s.verifiedSkills.slice(0, 4).map((skill) => <Badge key={skill}>{skill}</Badge>)}
                      <Badge tone={s.ownership === "verified" ? "good" : "warn"}>ownership: {s.ownership}</Badge>
                      {s.hasTerminalProof && <Badge tone="good">terminal proof</Badge>}
                      {s.interviewVerified && <Badge tone="good">interview verified</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saved searches</CardTitle>
          </CardHeader>
          <CardBody>
            {savedSearches.length === 0 ? (
              <ScaffoldNotice detail="No saved searches yet. Use Save on a filtered result set." />
            ) : (
              <ul className="space-y-2 text-sm">
                {savedSearches.map((s) => (
                  <li key={s.id} className="rounded border border-border bg-panel2/40 p-2">
                    <div className="font-medium text-ink">{s.name}</div>
                    <div className="mt-1 text-[11px] text-muted">{new Date(s.createdAt).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </RoleShell>
  );
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | string[];
}) {
  return (
    <label className="text-xs text-muted">
      <span className="font-semibold uppercase tracking-wide">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={Array.isArray(defaultValue) ? defaultValue[0] : defaultValue ?? ""}
        className="mt-1 h-9 w-full rounded-md border border-border bg-bg/65 px-2 text-sm text-ink"
      />
    </label>
  );
}

function Select({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string | string[];
  options: Array<[string, string]>;
}) {
  return (
    <label className="text-xs text-muted">
      <span className="font-semibold uppercase tracking-wide">{label}</span>
      <select
        name={name}
        defaultValue={Array.isArray(defaultValue) ? defaultValue[0] : defaultValue ?? ""}
        className="mt-1 h-9 w-full rounded-md border border-border bg-bg/65 px-2 text-sm text-ink"
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </label>
  );
}
