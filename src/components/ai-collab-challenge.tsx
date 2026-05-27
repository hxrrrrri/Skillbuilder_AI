"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, TextArea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Evaluation = {
  challenge_id?: string;
  prompt?: string;
  target_files?: string[];
  expected_capabilities?: string[];
  difficulty?: "easy" | "medium" | "hard";
  correctness_score: number;
  explanation_quality_score: number;
  test_awareness_score: number;
  review_discipline_score: number;
  ai_collaboration_maturity_score: number;
  overall_score: number;
  tool_used: string;
  feedback: string;
  what_this_proves?: string[];
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
  const challenge = {
    id: `challenge-${runId.slice(0, 8)}`,
    prompt: `Improve the reliability of ${target}: add defensive handling for one realistic edge case and include or justify the test coverage.`,
    targetFiles: importantFiles.slice(0, 3),
    expectedCapabilities: ["repo-aware patch targeting", "test awareness", "AI-output review", "tradeoff communication"],
    difficulty: "medium" as const,
  };

  const [prompt, setPrompt] = useState(challenge.prompt);
  const [diff, setDiff] = useState("");
  const [explanation, setExplanation] = useState("");
  const [testsChanged, setTestsChanged] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [limitations, setLimitations] = useState(false);
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
          challenge_id: challenge.id,
          challenge_prompt: prompt,
          target_files: challenge.targetFiles,
          expected_capabilities: challenge.expectedCapabilities,
          difficulty: challenge.difficulty,
          proposed_diff: diff,
          explanation,
          tests_changed: testsChanged,
          reviewed_ai_output: reviewed,
          limitations_discussed: limitations,
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
          {evaln.difficulty && <Badge>{evaln.difficulty}</Badge>}
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
        {evaln.what_this_proves?.length ? (
          <div className="rounded border border-border bg-panel/70 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted">What this proves</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              {evaln.what_this_proves.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 rounded border border-border bg-panel/70 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Generated challenge</Badge>
            <Badge>{challenge.difficulty}</Badge>
          </div>
          <div className="mt-2 text-xs uppercase tracking-wide text-muted">Target files</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {challenge.targetFiles.map((file) => <Badge key={file}>{file}</Badge>)}
          </div>
          <div className="mt-2 text-xs uppercase tracking-wide text-muted">Expected capabilities</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {challenge.expectedCapabilities.map((cap) => <Badge key={cap}>{cap}</Badge>)}
          </div>
        </div>
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
        <label className="text-xs uppercase tracking-wide text-muted">Tests added/changed or justification</label>
        <TextArea
          value={testsChanged}
          onChange={(e) => setTestsChanged(e.target.value)}
          className="mt-1 min-h-[70px]"
          placeholder="Example: added src/foo.test.ts for null input; or explain why test was not practical."
        />
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <label className="flex items-center gap-2 rounded border border-border bg-panel/60 p-2">
          <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
          <span>Reviewed AI output before submitting</span>
        </label>
        <label className="flex items-center gap-2 rounded border border-border bg-panel/60 p-2">
          <input type="checkbox" checked={limitations} onChange={(e) => setLimitations(e.target.checked)} />
          <span>Mentioned limitations or tradeoffs</span>
        </label>
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
