"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

type Evidence = { file?: string; line?: number; reason: string };
type Score = {
  skill: string;
  score: number | null;
  confidence: number;
  source: string;
  evidence: Evidence[];
  validator_notes?: string | null;
  assertion_ids?: string[];
};

function scoreTone(score: number | null): "good" | "warn" | "bad" | "default" {
  if (score == null) return "default";
  if (score >= 70) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

function sourceLabel(src: string): { label: string; tone: "good" | "warn" | "bad" | "accent" | "default" } {
  switch (src) {
    case "llm":
      return { label: "LLM", tone: "good" };
    case "heuristic":
      return { label: "Heuristic", tone: "warn" };
    case "mock":
      return { label: "Mock", tone: "bad" };
    case "pending":
      return { label: "Pending", tone: "default" };
    default:
      return { label: src, tone: "default" };
  }
}

function supportLabel(score: number | null, ev: Evidence[]): { label: string; tone: "good" | "warn" | "bad" } {
  if (score == null) return { label: "Insufficient", tone: "bad" };
  const cited = ev.filter((e) => e.file).length;
  if (cited >= 2) return { label: "Verified", tone: "good" };
  if (cited === 1) return { label: "Partial", tone: "warn" };
  return { label: "Insufficient", tone: "bad" };
}

export function EvidenceLocker({ scores }: { scores: Score[] }) {
  const [filter, setFilter] = useState<string>("all");
  const skills = Array.from(new Set(scores.map((s) => s.skill)));
  const shown = filter === "all" ? scores : scores.filter((s) => s.skill === filter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Filter:</span>
        <button
          onClick={() => setFilter("all")}
          className={`rounded px-2 py-0.5 border ${filter === "all" ? "border-accent text-accent" : "border-border text-muted hover:text-ink"}`}
        >
          all
        </button>
        {skills.map((sk) => (
          <button
            key={sk}
            onClick={() => setFilter(sk)}
            className={`rounded px-2 py-0.5 border ${filter === sk ? "border-accent text-accent" : "border-border text-muted hover:text-ink"}`}
          >
            {sk}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {shown.map((s) => {
          const support = supportLabel(s.score, s.evidence);
          const src = sourceLabel(s.source);
          return (
            <div key={s.skill} className="rounded-lg border border-border bg-panel/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-ink">{s.skill}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={scoreTone(s.score)}>{s.score == null ? "not measured" : `${s.score}/100`}</Badge>
                  <Badge tone={src.tone}>{src.label}</Badge>
                  <Badge tone={support.tone}>{support.label}</Badge>
                  <span className="text-xs text-muted">conf {Math.round(s.confidence * 100)}%</span>
                </div>
              </div>
              {s.assertion_ids && s.assertion_ids.length > 0 && (
                <div className="mt-2 text-xs text-muted">
                  Contract refs: {s.assertion_ids.map((id) => <span key={id} className="mr-1 font-mono">{id}</span>)}
                </div>
              )}
              <ul className="mt-3 space-y-1 text-sm text-muted">
                {s.evidence.length === 0 && <li className="italic">No evidence cited.</li>}
                {s.evidence.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-accent">›</span>
                    <span>
                      {e.file && (
                        <span className="mr-1 font-mono text-xs text-ink/80">
                          {e.file}{e.line ? `:${e.line}` : ""}
                        </span>
                      )}
                      {e.reason}
                    </span>
                  </li>
                ))}
                {s.validator_notes && (
                  <li className="flex gap-2 italic">
                    <span className="text-warn">!</span>
                    <span>Validator: {s.validator_notes}</span>
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
