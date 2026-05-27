"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export type SandboxPaletteEntry = {
  label: string;
  command: string;
  args: string[];
  usedFor: "git" | "testing" | "build" | "typecheck" | "lint" | "install" | "agent" | "security" | "ownership";
  approvalRequired?: boolean;
  description?: string;
};

const DEFAULT_PALETTE: SandboxPaletteEntry[] = [
  { label: "git status", command: "git", args: ["status"], usedFor: "git", description: "Repo state." },
  { label: "git log --oneline -n 30", command: "git", args: ["log", "--oneline", "-n", "30"], usedFor: "git", description: "Recent commits, single-line." },
  { label: "git shortlog -sn", command: "git", args: ["shortlog", "-sn"], usedFor: "git", description: "Authorship summary." },
  { label: "git diff --stat HEAD~5..HEAD", command: "git", args: ["diff", "--stat", "HEAD~5..HEAD"], usedFor: "git", description: "Recent change size." },
  { label: "npm test", command: "npm", args: ["test"], usedFor: "testing", description: "Run the test suite." },
  { label: "npm run typecheck", command: "npm", args: ["run", "typecheck"], usedFor: "typecheck", description: "TypeScript check." },
  { label: "npm run lint", command: "npm", args: ["run", "lint"], usedFor: "lint", description: "Lint the project." },
  { label: "npm run build", command: "npm", args: ["run", "build"], usedFor: "build", description: "Production build." },
  { label: "pnpm install", command: "pnpm", args: ["install"], usedFor: "install", approvalRequired: true, description: "Install deps (needs approval)." },
  { label: "npm install", command: "npm", args: ["install"], usedFor: "install", approvalRequired: true, description: "Install deps (needs approval)." },
];

export type SandboxTimelineEntry = {
  id: string;
  paletteLabel: string;
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  durationMs: number;
  status: string;
  stdoutSummary: string;
  stderrSummary: string;
  usedFor: SandboxPaletteEntry["usedFor"];
  savedAsEvidence: boolean;
  ranAt: string;
};

type Props = {
  runId: string;
  initialIncludeTerminalProof: boolean;
  initialEvidence: Array<{
    command: string;
    cwd: string;
    exitCode: number | null;
    durationMs: number;
    stdoutSummary: string;
    stderrSummary: string;
    usedFor: SandboxPaletteEntry["usedFor"];
  }>;
  canPublishToProfile: boolean;
  palette?: SandboxPaletteEntry[];
};

function summarize(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n…[${text.length - max} bytes truncated]`;
}

export function SandboxTerminal({
  runId,
  initialIncludeTerminalProof,
  initialEvidence,
  canPublishToProfile,
  palette = DEFAULT_PALETTE,
}: Props) {
  const [timeline, setTimeline] = useState<SandboxTimelineEntry[]>(() =>
    initialEvidence.map((e, i) => ({
      id: `seed-${i}`,
      paletteLabel: e.command,
      command: e.command.split(" ")[0] ?? "",
      args: e.command.split(" ").slice(1),
      cwd: e.cwd,
      exitCode: e.exitCode,
      durationMs: e.durationMs,
      status: e.exitCode === 0 ? "completed" : "completed",
      stdoutSummary: e.stdoutSummary,
      stderrSummary: e.stderrSummary,
      usedFor: e.usedFor,
      savedAsEvidence: true,
      ranAt: "(previously saved)",
    })),
  );
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<{ entry: SandboxPaletteEntry; reason: string } | null>(null);
  const [includeOnProfile, setIncludeOnProfile] = useState<boolean>(initialIncludeTerminalProof);
  const [publishingFlag, setPublishingFlag] = useState(false);

  const evidenceCount = useMemo(() => timeline.filter((t) => t.savedAsEvidence).length, [timeline]);

  const execute = useCallback(
    async (entry: SandboxPaletteEntry, opts: { approved: boolean; saveAsEvidence: boolean }) => {
      const key = `${entry.command} ${entry.args.join(" ")}`;
      setRunningKey(key);
      setError(null);
      setPendingApproval(null);
      try {
        const res = await fetch("/api/local/command", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            command: entry.command,
            args: entry.args,
            mission_id: runId,
            approved: opts.approved,
            saveAsEvidence: opts.saveAsEvidence,
            usedFor: entry.usedFor,
          }),
        });
        const data = await res.json();
        if (res.status === 403 && data.error === "approval_required") {
          setPendingApproval({ entry, reason: data.reason ?? "approval required" });
          return;
        }
        if (!res.ok) {
          setError(`${data.error ?? "failed"}: ${data.reason ?? data.detail ?? ""}`);
          return;
        }
        const entryId = data.id as string;
        const tlEntry: SandboxTimelineEntry = {
          id: entryId,
          paletteLabel: entry.label,
          command: data.command,
          args: data.args ?? [],
          cwd: data.cwd,
          exitCode: data.exitCode,
          durationMs: data.durationMs,
          status: data.status,
          stdoutSummary: summarize(data.stdout ?? "", 2000),
          stderrSummary: summarize(data.stderr ?? "", 1000),
          usedFor: entry.usedFor,
          savedAsEvidence: opts.saveAsEvidence,
          ranAt: data.completedAt ?? new Date().toISOString(),
        };
        setTimeline((t) => [tlEntry, ...t]);
      } catch (err: any) {
        setError(err?.message ?? String(err));
      } finally {
        setRunningKey(null);
      }
    },
    [runId],
  );

  const togglePublishOnProfile = useCallback(
    async (next: boolean) => {
      setPublishingFlag(true);
      setIncludeOnProfile(next);
      try {
        const res = await fetch("/api/local/publish-transcript", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ run_id: runId, include: next }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(`profile toggle failed: ${data.reason ?? data.error ?? res.status}`);
          setIncludeOnProfile(!next);
        }
      } catch (err: any) {
        setError(err?.message ?? String(err));
        setIncludeOnProfile(!next);
      } finally {
        setPublishingFlag(false);
      }
    },
    [runId],
  );

  useEffect(() => {
    if (!pendingApproval) return;
    const t = setTimeout(() => setPendingApproval(null), 30_000);
    return () => clearTimeout(t);
  }, [pendingApproval]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Sandbox command palette</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-3 text-xs text-muted">
            Commands run inside <code className="rounded bg-panel2 px-1 py-0.5">.skillproof/runs/{runId}</code>.
            Cwd jailed; allowlist enforced; destructive patterns refused; output redacted before storage.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {palette.map((p) => {
              const key = `${p.command} ${p.args.join(" ")}`;
              const isRunning = runningKey === key;
              return (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 rounded border border-border bg-panel2/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm text-ink">{p.label}</div>
                    {p.description && (
                      <div className="truncate text-[11px] text-muted">{p.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {p.approvalRequired && <Badge tone="warn">approval</Badge>}
                    <Badge>{p.usedFor}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => execute(p, { approved: !!p.approvalRequired, saveAsEvidence: false })}
                      disabled={isRunning}
                    >
                      {isRunning ? "running…" : "run"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {pendingApproval && (
            <div className="mt-3 rounded border border-warn/40 bg-warn/10 p-2 text-xs text-warn">
              <strong>Approval required</strong> — {pendingApproval.reason}.{" "}
              <button
                className="underline"
                onClick={() => execute(pendingApproval.entry, { approved: true, saveAsEvidence: false })}
              >
                Approve and run
              </button>
            </div>
          )}
          {error && <div className="mt-3 text-xs text-bad">{error}</div>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Execution timeline ({timeline.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted">No commands yet. Pick one from the palette above.</p>
          ) : (
            <ul className="space-y-2">
              {timeline.map((t) => (
                <li key={t.id} className="rounded border border-border bg-panel2/40 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone={t.exitCode === 0 ? "good" : t.exitCode === null ? "default" : "bad"}>
                      {t.exitCode === null ? t.status : `exit ${t.exitCode}`}
                    </Badge>
                    <Badge>{t.usedFor}</Badge>
                    <code className="text-ink">{[t.command, ...t.args].join(" ") || t.paletteLabel}</code>
                    <span className="text-muted">{t.durationMs}ms</span>
                    <span className="ml-auto flex items-center gap-2">
                      {t.savedAsEvidence ? (
                        <Badge tone="good">in proof transcript</Badge>
                      ) : (
                        <SaveToTranscriptButton
                          runId={runId}
                          entry={t}
                          onSaved={() =>
                            setTimeline((all) => all.map((x) => (x.id === t.id ? { ...x, savedAsEvidence: true } : x)))
                          }
                        />
                      )}
                    </span>
                  </div>
                  {t.stdoutSummary && (
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-bg/60 p-2 text-[11px] text-muted">
                      {t.stdoutSummary}
                    </pre>
                  )}
                  {t.stderrSummary && (
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-bg/60 p-2 text-[11px] text-bad">
                      {t.stderrSummary}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {canPublishToProfile && (
        <Card>
          <CardHeader>
            <CardTitle>Public profile inclusion</CardTitle>
          </CardHeader>
          <CardBody>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={includeOnProfile}
                disabled={publishingFlag}
                onChange={(e) => togglePublishOnProfile(e.target.checked)}
              />
              <span>
                Include a redacted subset of this proof transcript on my public profile (currently{" "}
                <strong>{evidenceCount}</strong> command{evidenceCount === 1 ? "" : "s"} marked).
              </span>
            </label>
            <p className="mt-2 text-xs text-muted">
              Off by default. Output is redacted before storage; toggling on or off does not re-run anything.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function SaveToTranscriptButton({
  runId,
  entry,
  onSaved,
}: {
  runId: string;
  entry: SandboxTimelineEntry;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/local/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command: entry.command,
          args: entry.args,
          mission_id: runId,
          approved: true,
          saveAsEvidence: true,
          usedFor: entry.usedFor,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.reason ?? data.error ?? `${res.status}`);
        return;
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="flex items-center gap-2">
      <button
        className="rounded border border-border bg-panel/40 px-2 py-1 text-[11px] text-ink hover:border-accent/60 disabled:opacity-50"
        onClick={save}
        disabled={busy}
      >
        {busy ? "saving…" : "add to proof transcript"}
      </button>
      {err && <span className="text-[11px] text-bad">{err}</span>}
    </span>
  );
}
