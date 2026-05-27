"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/input";
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
const STEPS = ["Tool", "Prompt", "Diff", "Explanation", "Discipline", "Submit"] as const;
type StepIdx = 0 | 1 | 2 | 3 | 4 | 5;

export function AIChallengeWizard({
  runId,
  importantFiles,
  existing,
}: {
  runId: string;
  importantFiles: string[];
  existing?: Evaluation | null;
}) {
  const target = importantFiles[0] ?? "the main module";
  const defaultPrompt = `Improve the reliability of ${target}: add defensive handling for one realistic edge case and include or justify the test coverage.`;

  const [step, setStep] = useState<StepIdx>(0);
  const [tool, setTool] = useState("Claude Code");
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [diff, setDiff] = useState("");
  const [explanation, setExplanation] = useState("");
  const [testsChanged, setTestsChanged] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [limitations, setLimitations] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Evaluation | null>(existing ?? null);

  const targetFiles = importantFiles.slice(0, 3);
  const expectedCapabilities = ["repo-aware patch targeting", "test awareness", "AI-output review", "tradeoff communication"];
  const challengeId = `challenge-${runId.slice(0, 8)}`;

  function canAdvance(): boolean {
    if (step === 0) return tool.length > 0;
    if (step === 1) return prompt.trim().length >= 10;
    if (step === 2) return diff.trim().length >= 5;
    if (step === 3) return explanation.trim().length >= 20;
    if (step === 4) return true;
    return true;
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/challenge/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          challenge_id: challengeId,
          challenge_prompt: prompt,
          target_files: targetFiles,
          expected_capabilities: expectedCapabilities,
          difficulty: "medium",
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
      setResult(data.evaluation);
    } catch (e: any) {
      setError(e?.message ?? "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="good">Overall {result.overall_score}/100</Badge>
          <Badge>{result.tool_used}</Badge>
          {result.difficulty && <Badge>{result.difficulty}</Badge>}
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
          {([
            ["Correctness", result.correctness_score],
            ["Explanation", result.explanation_quality_score],
            ["Test awareness", result.test_awareness_score],
            ["Review discipline", result.review_discipline_score],
            ["AI maturity", result.ai_collaboration_maturity_score],
          ] as Array<[string, number]>).map(([k, v]) => (
            <div key={k} className="rounded border border-border bg-panel/70 p-2 text-center">
              <div className="text-xs text-muted">{k}</div>
              <div className="font-semibold text-ink">{v}/100</div>
            </div>
          ))}
        </div>
        <p className="text-sm italic text-muted">{result.feedback}</p>
        {result.what_this_proves?.length ? (
          <div className="rounded border border-border bg-panel/70 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted">What this proves</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              {result.what_this_proves.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        ) : null}
        <Button variant="outline" onClick={() => setResult(null)}>
          Submit another attempt
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProgressBar step={step} />

      {step === 0 && (
        <Step title="1. What tool did you use?">
          <div className="flex flex-wrap gap-2">
            {TOOLS.map((t) => (
              <button
                key={t}
                onClick={() => setTool(t)}
                className={`rounded px-3 py-1 text-sm border ${tool === t ? "border-accent text-accent" : "border-border text-muted hover:text-ink"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </Step>
      )}

      {step === 1 && (
        <Step
          title="2. Challenge prompt"
          help={`Targets: ${targetFiles.join(", ") || "(none detected)"}. You can edit this prompt.`}
        >
          <TextArea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-[100px]" />
        </Step>
      )}

      {step === 2 && (
        <Step title="3. Paste your diff or code" help="Unified diff or a code patch.">
          <TextArea
            value={diff}
            onChange={(e) => setDiff(e.target.value)}
            className="min-h-[180px] font-mono text-xs"
            placeholder="--- a/path\n+++ b/path\n@@ ...\n+ ..."
          />
        </Step>
      )}

      {step === 3 && (
        <Step
          title="4. Explanation"
          help="Why this approach? What did you skip? Any tradeoffs?"
        >
          <TextArea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="min-h-[140px]"
          />
          <div className="mt-3">
            <label className="text-xs uppercase tracking-wide text-muted">
              Tests added/changed (or justify skipping)
            </label>
            <TextArea
              value={testsChanged}
              onChange={(e) => setTestsChanged(e.target.value)}
              className="mt-1 min-h-[80px]"
              placeholder="Example: added src/foo.test.ts for null input."
            />
          </div>
        </Step>
      )}

      {step === 4 && (
        <Step title="5. Review discipline" help="Be honest — heuristics penalize empty boxes.">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded border border-border bg-panel/60 p-2">
              <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
              <span>I reviewed the AI output before submitting</span>
            </label>
            <label className="flex items-center gap-2 rounded border border-border bg-panel/60 p-2">
              <input type="checkbox" checked={limitations} onChange={(e) => setLimitations(e.target.checked)} />
              <span>I mentioned limitations or tradeoffs</span>
            </label>
          </div>
        </Step>
      )}

      {step === 5 && (
        <Step title="6. Submit" help="The evaluator will score correctness, explanation, test awareness, review discipline, AI maturity.">
          <ul className="rounded border border-border bg-panel/40 p-3 text-xs text-muted">
            <li>Tool: <span className="text-ink">{tool}</span></li>
            <li>Diff: <span className="text-ink">{diff.length} chars</span></li>
            <li>Explanation: <span className="text-ink">{explanation.length} chars</span></li>
            <li>Tests box: <span className="text-ink">{testsChanged ? testsChanged.length + " chars" : "—"}</span></li>
            <li>Reviewed: <span className="text-ink">{reviewed ? "yes" : "no"}</span></li>
            <li>Limitations mentioned: <span className="text-ink">{limitations ? "yes" : "no"}</span></li>
          </ul>
        </Step>
      )}

      {error && <div className="text-sm text-bad">{error}</div>}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => (Math.max(0, s - 1) as StepIdx))} disabled={step === 0}>
          ← back
        </Button>
        {step < 5 ? (
          <Button onClick={() => setStep((s) => (Math.min(5, s + 1) as StepIdx))} disabled={!canAdvance()}>
            next →
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Evaluating…" : "Submit challenge"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ step }: { step: StepIdx }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
      {STEPS.map((label, i) => {
        const tone = i < step ? "good" : i === step ? "accent" : "default";
        return (
          <li key={label} className="flex items-center gap-2">
            <Badge tone={tone as any}>
              {i + 1}. {label}
            </Badge>
            {i < STEPS.length - 1 && <span className="text-muted">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Step({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-panel/50 p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {help && <p className="mt-1 text-xs text-muted">{help}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}
