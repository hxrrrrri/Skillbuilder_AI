"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export type InterviewQuestionView = {
  id: string;
  question: string;
  sourceFile: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  expectedSignals: string[];
  redFlags: string[];
  answer: string | null;
  answerScore: number | null;
  feedback: string | null;
  dimensionScores: Record<string, number> | null;
};

export function InterviewFlow({
  runId,
  initialQuestions,
}: {
  runId: string;
  initialQuestions: InterviewQuestionView[];
}) {
  const [questions, setQuestions] = useState(initialQuestions);
  const firstUnanswered = useMemo(
    () => questions.findIndex((q) => !q.answer),
    [questions],
  );
  const [index, setIndex] = useState<number>(firstUnanswered === -1 ? 0 : firstUnanswered);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = questions.length;
  const answeredCount = questions.filter((q) => q.answer).length;
  const current = questions[index];

  async function submitAnswer() {
    if (!current) return;
    if (draft.trim().length < 2) {
      setError("Answer is too short.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/interview/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: current.id, answer: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "failed");

      setQuestions((qs) =>
        qs.map((q) =>
          q.id === current.id
            ? {
                ...q,
                answer: draft,
                answerScore: data.blended_score ?? null,
                feedback: data.evaluation?.summary ?? null,
                dimensionScores: {
                  communication: data.evaluation?.communication_score ?? 0,
                  debugging: data.evaluation?.debugging_score ?? 0,
                  architecture_explanation: data.evaluation?.architecture_explanation_score ?? 0,
                  testing_reasoning: data.evaluation?.testing_reasoning_score ?? 0,
                  understanding_of_own_code: data.evaluation?.understanding_of_own_code ?? 0,
                },
              }
            : q,
        ),
      );
      setDraft("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (!current) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-muted">No interview questions to display.</p>
        </CardBody>
      </Card>
    );
  }

  const progressPct = Math.round((answeredCount / Math.max(1, total)) * 100);
  const isAnswered = !!current.answer;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Question {index + 1} of {total} · {answeredCount}/{total} answered
          </span>
          <span>{progressPct}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded bg-panel2">
          <div className="h-full bg-accent transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Q{index + 1}. {current.question}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {current.sourceFile && (
            <div className="text-xs font-mono text-muted">
              ↳ {current.sourceFile}
              {current.lineStart
                ? `:${current.lineStart}${current.lineEnd && current.lineEnd !== current.lineStart ? `-${current.lineEnd}` : ""}`
                : ""}
            </div>
          )}

          {isAnswered ? (
            <>
              <p className="rounded border border-border bg-panel/40 p-3 text-sm text-ink">{current.answer}</p>
              {current.answerScore != null && (
                <div className="flex items-center gap-2">
                  <Badge tone="good">{current.answerScore}/100 blended</Badge>
                </div>
              )}
              {current.dimensionScores && (
                <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                  {Object.entries(current.dimensionScores).map(([k, v]) => (
                    <div key={k} className="rounded border border-border bg-panel/60 px-2 py-1 text-center">
                      <div className="text-muted">{k.replace(/_/g, " ")}</div>
                      <div className="font-semibold text-ink">{v}/100</div>
                    </div>
                  ))}
                </div>
              )}
              {current.feedback && (
                <p className="text-xs italic text-muted">Validator: {current.feedback}</p>
              )}
              <details className="text-xs text-muted">
                <summary className="cursor-pointer text-accent">Expected signals · Red flags</summary>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide">Expected signals</div>
                    <ul className="mt-1 list-disc pl-5">
                      {current.expectedSignals.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide">Red flags</div>
                    <ul className="mt-1 list-disc pl-5">
                      {current.redFlags.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <>
              <TextArea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[160px]"
                placeholder="Type your answer. Explain WHY, not just WHAT."
              />
              {error && <div className="text-xs text-bad">{error}</div>}
              <div className="flex justify-end">
                <Button onClick={submitAnswer} disabled={submitting}>
                  {submitting ? "Scoring…" : "Submit answer"}
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          ← previous
        </Button>
        <Button
          variant="outline"
          onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
          disabled={index >= total - 1}
        >
          next →
        </Button>
      </div>
    </div>
  );
}
