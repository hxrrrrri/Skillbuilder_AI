"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Row = {
  scoreId: string;
  runId: string;
  skill: string;
  score: number;
  scoreSource: string;
  repo: string;
  item: {
    reason?: string;
    source?: string;
    file?: string;
    line?: number | null;
    line_start?: number | null;
    line_end?: number | null;
    snippet?: string;
    validator_note?: string | null;
  };
};

const SOURCES = ["", "repo", "terminal", "interview", "challenge", "git", "docs", "security"];

export function EvidenceSearch() {
  const [skill, setSkill] = useState("");
  const [source, setSource] = useState("");
  const [runId, setRunId] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function search() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (skill) params.set("skill", skill);
      if (source) params.set("source", source);
      if (runId) params.set("run_id", runId);
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/evidence?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "failed");
        return;
      }
      setRows(data.rows);
      setTotal(data.total);
    } catch (e: any) {
      setErr(e?.message ?? "failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-xs uppercase tracking-wide text-muted">Skill</label>
          <Input value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="Testing" className="mt-1" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted">Source</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="mt-1 h-11 w-full rounded-md border border-border bg-bg/65 px-3 text-ink"
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s || "any"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted">Run ID</label>
          <Input value={runId} onChange={(e) => setRunId(e.target.value)} placeholder="cl..." className="mt-1 font-mono text-xs" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted">Free text</label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search reason / file / snippet" className="mt-1" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={search} disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </Button>
        {rows && (
          <span className="text-xs text-muted">
            {total} match{total === 1 ? "" : "es"}
          </span>
        )}
        {err && <Badge tone="bad">{err}</Badge>}
      </div>

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-panel2/40 text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2 px-2">Skill</th>
                <th className="py-2 px-2">Source</th>
                <th className="py-2 px-2">Run / repo</th>
                <th className="py-2 px-2">File</th>
                <th className="py-2 px-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={`${r.scoreId}-${i}`}>
                  <td className="px-2 py-1 align-top">
                    <Badge>{r.skill}</Badge>
                    <span className="ml-1 text-[11px] text-muted">{r.score}/100</span>
                  </td>
                  <td className="px-2 py-1 align-top">
                    <Badge tone={r.item.source === "challenge" || r.item.source === "interview" ? "accent" : "default"}>
                      {r.item.source ?? "—"}
                    </Badge>
                  </td>
                  <td className="px-2 py-1 align-top text-xs">
                    <Link href={`/admin/runs/${r.runId}`} className="font-mono text-accent hover:underline">
                      {r.runId.slice(0, 8)}
                    </Link>
                    <div className="text-muted">{r.repo}</div>
                  </td>
                  <td className="px-2 py-1 align-top font-mono text-[11px] text-muted">
                    {r.item.file ?? "—"}
                    {r.item.line_start ? `:${r.item.line_start}${r.item.line_end && r.item.line_end !== r.item.line_start ? `-${r.item.line_end}` : ""}` : r.item.line ? `:${r.item.line}` : ""}
                  </td>
                  <td className="px-2 py-1 align-top text-xs text-ink">{r.item.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && rows.length === 0 && (
        <p className="text-xs text-muted">No matches.</p>
      )}
    </div>
  );
}
