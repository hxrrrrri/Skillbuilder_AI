"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, TextArea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Evaluation = {
  correctness_score: number;
  explanation_quality_score: number;
  test_awareness_score: number;
  review_discipline_score: number;
  ai_collaboration_maturity_score: number;
  overall_score: number;
  tool_used: string;
  feedback: string;
};

const TOOLS = ["Claude Code", "Codex", "Cursor", "Gemini", "Manual", "Other"];

export function AICollabChallenge({
  runId,
  importantFiles,
  existing,
  onUpdated,
}: {
  runId: string;
  importantFiles: string[];
  existing?: Evaluation | null;
  onUpdated?: (e: Evaluation) => void;
}) {
  const target = importantFiles[0] ?? "the main module";
  const defaultPrompt = `Add null-handling and one unit test to ${target}.`;

  const [prompt, setPrompt] = useState(defaultPrompt);
  const [diff, setDiff] = useState("");
  const [explanation, setExplanation] = useState("");
  const [tool, setTool] = useState("Claude Code");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evaln, setEvaln] = useState<Evaluation | null>(existing ?? null);

  async function submit() {
    setError(null);
    if (diff.length < 5 || explanation.length < 5) {
      setError("Paste a diff and a short explanation (min 5 chars each).");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/challenge/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          challenge_prompt: prompt,
          proposed_diff: diff,
          explanation,
          tool_used: tool,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "failed");
      setEvaln(data.evaluation);
      onUpdated?.(data.evaluation);
    } catch (e: any) {
      setError(e.message ?? "Failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (evaln) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="good">Overall {evaln.overall_score}/100</Badge>
          <Badge>{evaln.tool_used}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
          {[
            ["Correctness", evaln.correctness_score],
            ["Explanation", evaln.explanation_quality_score],
            ["Test awareness", evaln.test_awareness_score],
            ["Review discipline", evaln.review_discipline_score],
            ["AI maturity", evaln.ai_collaboration_maturity_score],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded border border-border bg-panel/70 p-2 text-center">
              <div className="text-xs text-muted">{k}</div>
              <div className="font-semibold text-ink">{v as number}/100</div>
            </div>
          ))}
        </div>
        <p className="text-sm italic text-muted">{evaln.feedback}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs uppercase tracking-wide text-muted">Challenge prompt</label>
        <TextArea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="mt-1 min-h-[60px]" />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wide text-muted">Proposed diff / code</label>
        <TextArea
          value={diff}
          onChange={(e) => setDiff(e.target.value)}
          className="mt-1 min-h-[140px] font-mono text-xs"
          placeholder="--- a/path\n+++ b/path\n@@ ...\n+ ..."
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wide text-muted">Explanation</label>
        <TextArea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          className="mt-1 min-h-[100px]"
          placeholder="Why this approach? What did you skip? Any tradeoffs?"
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wide text-muted">Tool used</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {TOOLS.map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className={`rounded px-2 py-1 text-xs border ${tool === t ? "border-accent text-accent" : "border-border text-muted hover:text-ink"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="text-sm text-bad">{error}</div>}
      <Button onClick={submit} disabled={submitting}>
        {submitting ? "Evaluating…" : "Submit challenge"}
      </Button>
    </div>
  );
}
