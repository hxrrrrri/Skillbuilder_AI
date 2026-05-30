import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleShell, ScaffoldNotice } from "@/components/role-shell";
import { ADMIN_NAV } from "../../_nav";
import { TraceEventList } from "./trace-event-list";

export const dynamic = "force-dynamic";

export default async function AdminRunDetailPage({ params }: { params: { id: string } }) {
  await requireAdminPage(`/admin/runs/${params.id}`);

  const run = await prisma.analysisRun.findUnique({
    where: { id: params.id },
    include: {
      candidate: { include: { user: true } },
      repository: true,
      events: { orderBy: { order: "asc" } },
      scores: true,
      questions: true,
      createdBy: true,
      tenant: true,
      profiles: true,
      skillRuns: { orderBy: { startedAt: "asc" } },
      evidenceFindings: { orderBy: { createdAt: "asc" } },
      harnessSnapshot: true,
    },
  });
  if (!run) notFound();

  // Indexable lookup only — relies on AuditLog.targetType/targetId pair (both indexed).
  // The prior fallback used `metadata: { contains: run.id }`, which was a full
  // table scan in SQLite and unsupported on Postgres without a GIN index.
  const auditEntries = await prisma.auditLog.findMany({
    where: { targetType: "run", targetId: run.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: true },
  });

  const contract = safeJsonParse(run.validationContract, null);
  const validationCoverage = safeJsonParse<any[]>(run.validationCoverage, []);
  const validationSummary = safeJsonParse(run.validationSummary, null);
  const repoIntelligence = safeJsonParse(run.repoIntelligence, null);
  const terminalEvidence = safeJsonParse<any[]>(run.terminalEvidence, []);
  const providerMatrix = safeJsonParse(run.providerMatrix, null);
  const ownershipStatus = safeJsonParse(run.ownershipStatus, null);
  const authenticity = safeJsonParse(run.authenticitySignals, null);
  const contextPack = safeJsonParse(run.contextPack, null);

  const hasLegacyUnverifiedScores = run.executionMode === "mock" || run.scores.some((s) => ["mock", "heuristic"].includes(s.scoreSource));

  return (
    <RoleShell
      title={`Run trace · ${run.repository.owner}/${run.repository.repoName}`}
      subtitle={`Run ID: ${run.id}`}
      navLinks={ADMIN_NAV}
      activeHref="/admin/runs"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={run.status === "completed" ? "good" : run.status === "failed" ? "bad" : "warn"}>
          {run.status}
        </Badge>
        <Badge tone="default">mode: {run.executionMode}</Badge>
        <Badge tone={run.verificationLevel === "repo_interview_verified" ? "good" : "default"}>
          {run.verificationLevel.replace(/_/g, " ")}
        </Badge>
        {hasLegacyUnverifiedScores && <Badge tone="bad">legacy unverified score source</Badge>}
        {run.overallScore != null && <Badge tone="accent">score {run.overallScore}</Badge>}
        <Link href={`/admin/runs/${run.id}/terminal`} className="text-accent hover:underline">
          open sandbox terminal →
        </Link>
        {run.statusMessage && <span className="text-bad">{run.statusMessage}</span>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run metadata</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2">
            <KV k="Target role" v={run.targetRole} />
            <KV k="Candidate level" v={run.candidateLevel ?? "—"} />
            <KV
              k="Candidate"
              v={
                run.candidate
                  ? `${run.candidate.name}${run.candidate.user ? ` (${run.candidate.user.email})` : ""}`
                  : "—"
              }
            />
            <KV
              k="Created by"
              v={run.createdBy ? `${run.createdBy.email} · ${run.createdBy.role}` : "anonymous"}
            />
            <KV k="Tenant" v={run.tenant ? `${run.tenant.name} (${run.tenant.kind})` : "—"} />
            <KV k="Local install approved" v={run.localInstallApproved ? "yes" : "no"} />
            <KV k="Tokens raw → used" v={`${run.tokenEstimateRaw ?? 0} → ${run.tokenEstimateUsed ?? 0}`} />
            <KV k="Created" v={new Date(run.createdAt).toLocaleString()} />
            <KV k="Completed" v={run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"} />
            <KV
              k="Repo"
              v={
                <a
                  href={run.repository.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-accent hover:underline"
                >
                  {run.repository.repoUrl}
                </a>
              }
            />
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent pipeline ({run.events.length} events)</CardTitle>
        </CardHeader>
        <CardBody>
          {run.events.length === 0 ? (
            <ScaffoldNotice detail="No agent events yet. The pipeline has not started." />
          ) : (
            <TraceEventList
              runId={run.id}
              events={run.events.map((e) => ({
                id: e.id,
                agent: e.agentName,
                status: e.status,
                order: e.order,
                startedAt: e.startedAt?.toISOString() ?? null,
                completedAt: e.completedAt?.toISOString() ?? null,
                notes: e.notes,
                output: safeJsonParse(e.output, null),
              }))}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evaluator skill traces ({run.skillRuns.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {run.skillRuns.length === 0 ? (
            <ScaffoldNotice detail="No SkillRun provenance rows have been recorded yet." />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {run.skillRuns.map((s) => {
                const trace = safeJsonParse<any>(s.adminTraceJson, null);
                const evidenceIds = safeJsonParse<string[]>(s.evidenceIdsJson, []);
                return (
                  <li key={s.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-panel/60 backdrop-blur-sm">
                    <div className="flex flex-wrap items-center gap-2 p-4 text-xs">
                      <Badge tone={s.status === "completed" ? "good" : s.status === "failed" ? "bad" : "warn"}>{s.status}</Badge>
                      <code className="text-ink">{s.skillId}</code>
                      <Badge>v{s.skillVersion}</Badge>
                      {s.providerId && <Badge>{s.providerId}</Badge>}
                      {s.actualModel && <Badge>{s.actualModel}</Badge>}
                      {s.durationMs != null && <span className="text-muted">{s.durationMs}ms</span>}
                      <span className="font-mono text-muted">in:{s.inputHash.slice(0, 10)}</span>
                      {s.outputHash && <span className="font-mono text-muted">out:{s.outputHash.slice(0, 10)}</span>}
                    </div>
                    <div className="grid gap-2 border-t border-border p-4 text-xs">
                      <KV k="Candidate summary" v={s.candidateSummary ?? "—"} />
                      <KV k="Employer summary" v={s.employerSummary ?? "—"} />
                      <KV k="Evidence produced" v={String(evidenceIds.length)} />
                    </div>
                    {s.error && <p className="border-t border-border px-4 py-2 text-xs text-bad">{s.error}</p>}
                    <details className="mt-auto border-t border-border px-4 py-2.5">
                      <summary className="cursor-pointer text-xs text-accent">Open trace JSON</summary>
                      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-bg/40 p-3 text-[11px] text-muted">
                        {JSON.stringify(trace, null, 2)}
                      </pre>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {run.harnessSnapshot && (
        <Card>
          <CardHeader>
            <CardTitle>Harness context snapshot</CardTitle>
          </CardHeader>
          <CardBody>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-panel2/40 p-3 text-[11px] text-muted">
              {JSON.stringify(run.harnessSnapshot, null, 2)}
            </pre>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Evidence findings ({run.evidenceFindings.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {run.evidenceFindings.length === 0 ? (
            <ScaffoldNotice detail="No EvidenceFinding rows have been recorded yet." />
          ) : (
            <ul className="space-y-2">
              {run.evidenceFindings.map((f) => (
                <li key={f.id} className="rounded border border-border bg-panel2/40 p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{f.category}</Badge>
                    <Badge>{f.evidenceType}</Badge>
                    {f.severity && <Badge tone={f.severity === "critical" || f.severity === "high" ? "bad" : f.severity === "medium" ? "warn" : "default"}>{f.severity}</Badge>}
                    <span className="text-muted">{Math.round(f.confidence * 100)}%</span>
                    <span className="font-mono text-muted">{f.rawTextHash?.slice(0, 12)}</span>
                  </div>
                  <p className="mt-2 text-ink">{f.redactedText}</p>
                  {f.filePath && <p className="mt-1 font-mono text-muted">{f.filePath}:{f.lineStart ?? "?"}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Validation contract & coverage</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {contract ? (
            <ContractBlock contract={contract} coverage={validationCoverage} summary={validationSummary} />
          ) : (
            <ScaffoldNotice detail="No validation contract written by the orchestrator yet." />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skill scores ({run.scores.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {run.scores.length === 0 ? (
            <ScaffoldNotice detail="No scores yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Skill</th>
                    <th className="py-2 pr-3">Score</th>
                    <th className="py-2 pr-3">Confidence</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Validator notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {run.scores.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 pr-3 text-xs">{s.skillName}</td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {s.score === -1 ? <span className="text-muted">not measured</span> : s.score}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{s.confidence.toFixed(2)}</td>
                      <td className="py-2 pr-3 text-xs">
                        <Badge
                          tone={
                            s.scoreSource === "mock" || s.scoreSource === "heuristic"
                              ? "bad"
                              : s.scoreSource === "llm"
                              ? "accent"
                              : "default"
                          }
                        >
                          {s.scoreSource}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted">{s.validatorNotes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terminal evidence ({terminalEvidence.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {terminalEvidence.length === 0 ? (
            <ScaffoldNotice detail="No terminal commands recorded. Run in CLI or hybrid mode with local install approved to collect terminal proof." />
          ) : (
            <ul className="space-y-2">
              {terminalEvidence.map((t: any, i: number) => (
                <li key={i} className="rounded-md border border-border bg-panel2/40 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <code className="text-ink">{t.command}</code>
                    <span className={t.exitCode === 0 ? "text-good" : "text-bad"}>
                      exit {t.exitCode} · {t.durationMs ?? "?"}ms
                    </span>
                  </div>
                  {t.stdoutSummary && (
                    <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap text-[11px] text-muted">
                      {t.stdoutSummary}
                    </pre>
                  )}
                  {t.stderrSummary && (
                    <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] text-bad">
                      {t.stderrSummary}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Provider matrix</CardTitle>
          </CardHeader>
          <CardBody>
            {providerMatrix ? (
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-panel2/40 p-3 text-[11px] text-muted">
                {JSON.stringify(providerMatrix, null, 2)}
              </pre>
            ) : (
              <ScaffoldNotice detail="No provider matrix recorded." />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ownership status</CardTitle>
          </CardHeader>
          <CardBody>
            {ownershipStatus ? (
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-panel2/40 p-3 text-[11px] text-muted">
                {JSON.stringify(ownershipStatus, null, 2)}
              </pre>
            ) : (
              <ScaffoldNotice detail="Ownership not yet verified." />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Authenticity signals</CardTitle>
          </CardHeader>
          <CardBody>
            {authenticity ? (
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-panel2/40 p-3 text-[11px] text-muted">
                {JSON.stringify(authenticity, null, 2)}
              </pre>
            ) : (
              <ScaffoldNotice detail="No authenticity signals computed yet." />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Repo intelligence (truncated)</CardTitle>
          </CardHeader>
          <CardBody>
            {repoIntelligence ? (
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-panel2/40 p-3 text-[11px] text-muted">
                {truncateJson(repoIntelligence, 4000)}
              </pre>
            ) : (
              <ScaffoldNotice detail="Repo scanner has not produced an intelligence index yet." />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit log entries ({auditEntries.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {auditEntries.length === 0 ? (
            <ScaffoldNotice detail="No audit entries reference this run yet." />
          ) : (
            <ul className="divide-y divide-border">
              {auditEntries.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <code className="rounded bg-panel2 px-1.5 py-0.5 text-xs">{a.action}</code>
                    <span className="ml-2 text-xs text-muted">{a.actor?.email ?? "system"}</span>
                  </div>
                  <span className="text-xs text-muted">{new Date(a.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Published profiles ({run.profiles.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {run.profiles.length === 0 ? (
            <ScaffoldNotice detail="No public profiles published from this run." />
          ) : (
            <ul className="divide-y divide-border">
              {run.profiles.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link href={`/profile/${p.slug}`} className="font-mono text-accent hover:underline">
                      /{p.slug}
                    </Link>
                    <span className="ml-2 text-xs text-muted">visibility: {p.visibility}</span>
                  </div>
                  <span className="text-xs text-muted">{new Date(p.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Context pack (truncated)</CardTitle>
        </CardHeader>
        <CardBody>
          {contextPack ? (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-panel2/40 p-3 text-[11px] text-muted">
              {truncateJson(contextPack, 5000)}
            </pre>
          ) : (
            <ScaffoldNotice detail="No context pack written yet." />
          )}
        </CardBody>
      </Card>
    </RoleShell>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{k}</dt>
      <dd className="text-sm text-ink">{v}</dd>
    </div>
  );
}

function ContractBlock({ contract, coverage, summary }: { contract: any; coverage: any[]; summary: any }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Assertions" value={Array.isArray(contract.assertions) ? contract.assertions.length : 0} />
        <Stat label="Coverage entries" value={coverage.length} />
        <Stat label="Supported" value={coverage.filter((c) => c?.supported === true).length} tone="good" />
      </div>
      {summary && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-panel2/40 p-3 text-[11px] text-muted">
          {JSON.stringify(summary, null, 2)}
        </pre>
      )}
      <details className="rounded border border-border bg-panel2/40 p-2">
        <summary className="cursor-pointer text-xs text-muted">Full contract JSON</summary>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-[11px] text-muted">
          {JSON.stringify(contract, null, 2)}
        </pre>
      </details>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-md border border-border bg-panel2/40 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-1 font-display text-2xl ${
          tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function truncateJson(value: unknown, maxChars: number): string {
  const s = JSON.stringify(value, null, 2);
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + `\n... [truncated ${s.length - maxChars} chars]`;
}
