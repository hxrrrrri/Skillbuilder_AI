"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { TerminalConsole } from "@/components/terminal-console";

type Tool = {
  name: string;
  installed: boolean;
  command: string;
  version: string | null;
  authenticated: boolean;
  authStatus: string | null;
  capabilities: string[];
  setupHint?: string;
  error?: string | null;
};

type Report = {
  detectedAt: string;
  platform: string;
  tools: Tool[];
  recommendedMode: "api" | "cli" | "hybrid" | "local";
  reasons: string[];
};

type ProviderInfo = {
  config: any;
  availability: Array<{ id: string; label: string; available: boolean }>;
  matrix: Record<string, string>;
  mode: string;
};

type ProviderTestResult = {
  provider_id: string;
  available: boolean;
  json: any | null;
  raw?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  error?: string | null;
};

export default function LocalSetupPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [providers, setProviders] = useState<ProviderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"api" | "cli" | "hybrid" | "local">("hybrid");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({});

  async function load() {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        fetch("/api/local/tools", { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/local/providers?mode=${mode}`, { cache: "no-store" }).then((r) => r.json()),
      ]);
      setReport(r);
      setProviders(p);
      setDraft(JSON.stringify(p.config, null, 2));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function testProvider(providerId: string) {
    setTesting(providerId);
    try {
      const r = await fetch("/api/local/providers/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider_id: providerId }),
      });
      const data = await r.json();
      setTestResults((prev) => ({ ...prev, [providerId]: data }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { provider_id: providerId, available: false, json: null, error: err?.message ?? String(err) },
      }));
    } finally {
      setTesting(null);
    }
  }

  async function saveConfig() {
    setSaveMsg(null);
    try {
      const parsed = JSON.parse(draft);
      const res = await fetch("/api/local/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: parsed }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaveMsg("Saved. Re-detecting…");
      setEditing(false);
      await load();
    } catch (err: any) {
      setSaveMsg(`Error: ${err?.message ?? err}`);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wide text-muted">Local-first verification</div>
        <h1 className="text-2xl font-bold">Local Proof Runner — Setup</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          SkillProof can run verification missions through your local terminal tools — git, GitHub CLI,
          Claude Code, Codex CLI, Ollama — instead of forcing API keys. This dashboard shows what is
          installed, what is authenticated, and which execution mode is recommended.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-muted">Recommended mode</div>
            <div className="mt-1 text-2xl font-bold">
              {report?.recommendedMode ?? (loading ? "…" : "—")}
            </div>
            <ul className="mt-2 list-disc pl-4 text-xs text-muted">
              {(report?.reasons ?? []).map((r) => <li key={r}>{r}</li>)}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-muted">Platform</div>
            <div className="mt-1 font-mono">{report?.platform ?? "…"}</div>
            <div className="mt-2 text-xs text-muted">
              Detected at {report ? new Date(report.detectedAt).toLocaleString() : "…"}
            </div>
            <Button size="sm" variant="outline" className="mt-3" onClick={load}>
              Re-detect
            </Button>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-muted">Mode preview</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["api", "cli", "hybrid", "local"] as const).map((m) => (
                <button
                  key={m}
                  className={`rounded border px-2 py-1 text-xs ${
                    mode === m ? "border-accent text-accent" : "border-border text-muted hover:text-ink"
                  }`}
                  onClick={() => setMode(m)}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="mt-2 text-xs text-muted">Provider matrix shown below uses this mode.</div>
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Install & Verify policy</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 text-sm md:grid-cols-4">
          <div className="rounded border border-border bg-panel2/70 p-3">
            <div className="text-xs uppercase text-muted">Fixture seed</div>
            <Badge tone="warn" className="mt-2">dev-only disabled</Badge>
          </div>
          <div className="rounded border border-border bg-panel2/70 p-3">
            <div className="text-xs uppercase text-muted">CLI/hybrid default</div>
            <Badge tone="warn" className="mt-2">approval required</Badge>
          </div>
          <div className="rounded border border-border bg-panel2/70 p-3">
            <div className="text-xs uppercase text-muted">Allowed managers</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {["npm", "pnpm", "yarn", "bun"].map((pm) => <Badge key={pm}>{pm}</Badge>)}
            </div>
          </div>
          <div className="rounded border border-border bg-panel2/70 p-3">
            <div className="text-xs uppercase text-muted">Commands</div>
            <div className="mt-2 text-xs text-muted">install, test, build, typecheck, lint when available</div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Installed tools</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted">
                  <th className="py-2">Tool</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>Auth</th>
                  <th>Capabilities</th>
                  <th>Setup</th>
                </tr>
              </thead>
              <tbody>
                {(report?.tools ?? []).map((t) => (
                  <tr key={t.name} className="border-t border-border align-top">
                    <td className="py-2 font-mono">{t.name}</td>
                    <td>
                      <Badge tone={t.installed ? "good" : "bad"}>
                        {t.installed ? "installed" : "missing"}
                      </Badge>
                    </td>
                    <td className="font-mono text-xs">{t.version ?? "—"}</td>
                    <td className="text-xs">
                      <Badge tone={t.authenticated ? "good" : "warn"}>
                        {t.authenticated ? "ready" : t.authStatus ?? "—"}
                      </Badge>
                    </td>
                    <td className="space-x-1">
                      {t.capabilities.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        t.capabilities.map((c) => (
                          <Badge key={c}>{c}</Badge>
                        ))
                      )}
                    </td>
                    <td className="max-w-xs text-xs text-muted">{t.setupHint ?? t.error ?? "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provider matrix ({providers?.mode})</CardTitle>
        </CardHeader>
        <CardBody>
          {providers ? (
            <>
              <div className="grid gap-2 md:grid-cols-5">
                {(["orchestrator", "worker", "validator", "interview", "profile"] as const).map((r) => (
                  <div key={r} className="rounded border border-border p-2 text-sm">
                    <div className="text-xs uppercase text-muted">{r}</div>
                    <div className="mt-1 font-mono">{providers.matrix[r]}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {providers.availability.map((p) => (
                  <Badge key={p.id} tone={p.available ? "good" : "warn"}>
                    {p.label}: {p.available ? "available" : "off"}
                  </Badge>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                <div className="text-xs uppercase text-muted">Test JSON output</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {providers.availability.map((p) => {
                    const r = testResults[p.id];
                    return (
                      <div key={p.id} className="rounded border border-border p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono">{p.id}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={testing === p.id || !p.available}
                            onClick={() => testProvider(p.id)}
                          >
                            {testing === p.id ? "testing…" : "Test JSON output"}
                          </Button>
                        </div>
                        {r && (
                          <div className="mt-2 space-y-1">
                            <div>
                              <Badge tone={r.json && !r.error ? "good" : "warn"}>
                                {r.json && !r.error ? "JSON OK" : r.error ?? "no JSON"}
                              </Badge>
                              {r.model && <span className="ml-2 font-mono text-muted">{r.model}</span>}
                            </div>
                            {r.json && (
                              <pre className="overflow-x-auto rounded bg-panel2 p-2 font-mono">
                                {JSON.stringify(r.json, null, 2)}
                              </pre>
                            )}
                            {r.raw && (
                              <details>
                                <summary className="cursor-pointer text-muted">raw output</summary>
                                <pre className="overflow-x-auto rounded bg-panel2 p-2 font-mono">{r.raw}</pre>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4">
                {editing ? (
                  <div className="space-y-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="h-64 w-full rounded border border-border bg-panel2 p-2 font-mono text-xs"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveConfig}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                    </div>
                    {saveMsg && <div className="text-xs text-muted">{saveMsg}</div>}
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    Edit skillproof.local.json
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="text-muted">Loading…</div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test a command</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <p className="text-xs text-muted">
            Safe commands only. Destructive patterns are blocked. Output redacts known token shapes.
          </p>
          <TerminalConsole defaultCommand="git --version" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security and privacy</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Local CLI Mode can execute commands on your machine. SkillProof asks before destructive ops.</li>
            <li>Terminal transcripts may contain secrets. Common token patterns are redacted before persistence.</li>
            <li>Private repos stay local unless you choose Cloud or Hybrid mode.</li>
            <li>Mock/Heuristic mode never leaves the machine and never executes destructive commands.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
