"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Run = {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  status: string;
};

type Props = {
  missionId?: string;
  cwd?: string;
  defaultCommand?: string;
  enableSaveAsEvidence?: boolean;
};

export function TerminalConsole({ missionId, cwd, defaultCommand, enableSaveAsEvidence }: Props) {
  const [cmd, setCmd] = useState(defaultCommand ?? "git status");
  const [history, setHistory] = useState<Run[]>([]);
  const [latest, setLatest] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approveRequest, setApproveRequest] = useState<string | null>(null);
  const outRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [latest?.stdout, latest?.stderr]);

  function parseCmd(line: string): { command: string; args: string[] } {
    const parts = line.trim().match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
    const stripped = parts.map((p) => p.replace(/^"|"$/g, ""));
    return { command: stripped[0] ?? "", args: stripped.slice(1) };
  }

  async function execute(approved = false) {
    setError(null);
    setApproveRequest(null);
    if (!cmd.trim()) return;
    const { command, args } = parseCmd(cmd);
    setRunning(true);
    try {
      const res = await fetch("/api/local/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command,
          args,
          cwd,
          mission_id: missionId,
          approved,
          saveAsEvidence: false,
        }),
      });
      const data = await res.json();
      if (res.status === 403 && data.error === "approval_required") {
        setApproveRequest(data.reason ?? "approval required");
        return;
      }
      if (!res.ok) {
        setError(data.reason ?? data.detail ?? data.error ?? "failed");
        return;
      }
      const run = data as Run;
      setLatest(run);
      setHistory((h) => [run, ...h].slice(0, 20));
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setRunning(false);
    }
  }

  async function saveAsEvidence(usedFor: string) {
    if (!latest || !missionId) return;
    await fetch("/api/local/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command: latest.command,
        args: latest.args,
        cwd: latest.cwd,
        mission_id: missionId,
        approved: true,
        saveAsEvidence: true,
        usedFor,
      }),
    });
  }

  function copyOutput() {
    if (!latest) return;
    const text = `$ ${latest.command} ${latest.args.join(" ")}\n${latest.stdout}\n${latest.stderr}`;
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-[#0b0f14] p-3 font-mono text-sm text-ink/90">
      <div className="flex items-center gap-2">
        <span className="text-accent">$</span>
        <input
          className="flex-1 bg-transparent text-ink outline-none placeholder:text-muted"
          value={cmd}
          spellCheck={false}
          placeholder="git status"
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") execute(false);
          }}
          disabled={running}
        />
        <Button size="sm" onClick={() => execute(false)} disabled={running}>
          {running ? "Running…" : "Run"}
        </Button>
      </div>
      {approveRequest && (
        <div className="rounded border border-warn/40 bg-warn/10 p-2 text-xs text-warn">
          Needs approval: {approveRequest}.{" "}
          <button className="underline" onClick={() => execute(true)}>
            Approve and run
          </button>
        </div>
      )}
      {error && <div className="text-xs text-bad">{error}</div>}
      {latest && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone={latest.exitCode === 0 ? "good" : "bad"}>exit {latest.exitCode ?? "?"}</Badge>
            <Badge>{latest.status}</Badge>
            <span className="text-muted">{latest.durationMs}ms</span>
            <span className="ml-auto flex gap-2">
              <button className="text-accent hover:underline" onClick={copyOutput}>copy</button>
              {enableSaveAsEvidence && missionId && (
                <>
                  <button className="text-accent hover:underline" onClick={() => saveAsEvidence("testing")}>save as test evidence</button>
                  <button className="text-accent hover:underline" onClick={() => saveAsEvidence("build")}>save as build evidence</button>
                  <button className="text-accent hover:underline" onClick={() => saveAsEvidence("agent")}>save as agent evidence</button>
                </>
              )}
              <button className="text-muted hover:text-bad" onClick={() => setLatest(null)}>clear</button>
            </span>
          </div>
          <pre
            ref={outRef}
            className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-black/60 p-2 text-xs leading-relaxed"
          >
            {latest.stdout}
            {latest.stderr && <span className="text-bad">{"\n" + latest.stderr}</span>}
          </pre>
        </div>
      )}
      {history.length > 1 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">History ({history.length})</summary>
          <ul className="mt-1 space-y-1">
            {history.slice(1).map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2">
                <button
                  className="truncate text-left hover:text-accent"
                  onClick={() => setCmd([h.command, ...h.args].join(" "))}
                  title={[h.command, ...h.args].join(" ")}
                >
                  $ {[h.command, ...h.args].join(" ")}
                </button>
                <span className={h.exitCode === 0 ? "text-good" : "text-bad"}>exit {h.exitCode ?? "?"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
