import { hasRedaction } from "@/lib/evaluator-runtime/redaction";

type ScoreLike = {
  skillName: string;
  score: number;
  scoreSource: string;
  evidence: string;
};

type RunLike = {
  status: string;
  executionMode: string | null;
  providerMatrix: string | null;
  validationSummary: string | null;
  profileSummary?: string | null;
  employerVerifier?: string | null;
  scores: ScoreLike[];
};

export type PublishBlocker = {
  code: string;
  message: string;
  detail?: unknown;
};

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function hasObject(raw: string | null | undefined): boolean {
  const parsed = safeJson<any>(raw, null);
  return !!parsed && (typeof parsed !== "object" || Object.keys(parsed).length > 0);
}

export function getPublicProfilePublishBlockers(run: RunLike): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];

  if (run.status !== "completed") {
    blockers.push({ code: "run_incomplete", message: `Run must be completed before publishing. Current status: ${run.status}.` });
  }
  if (run.executionMode === "mock") {
    blockers.push({ code: "mock_execution_mode", message: "Mock execution mode cannot publish a public or unlisted profile." });
  }

  const unsafeScores = run.scores.filter((s) => s.scoreSource === "mock" || s.scoreSource === "heuristic");
  if (unsafeScores.length) {
    blockers.push({
      code: "unsafe_score_source",
      message: "Mock or heuristic score sources cannot be published.",
      detail: unsafeScores.map((s) => ({ skillName: s.skillName, scoreSource: s.scoreSource })),
    });
  }

  const missingEvidence = run.scores
    .filter((s) => s.score >= 0 && s.scoreSource !== "not_measured")
    .filter((s) => safeJson<any[]>(s.evidence, []).length === 0);
  if (missingEvidence.length) {
    blockers.push({
      code: "missing_evidence",
      message: "Every measured skill must cite at least one evidence item.",
      detail: missingEvidence.map((s) => s.skillName),
    });
  }

  if (!hasObject(run.providerMatrix)) {
    blockers.push({ code: "provider_matrix_missing", message: "Provider matrix must be stored before publishing." });
  }
  if (!hasObject(run.validationSummary)) {
    blockers.push({ code: "validation_summary_missing", message: "Validation summary must be stored before publishing." });
  }

  const publicPayload = [
    run.profileSummary,
    run.employerVerifier,
    ...run.scores.map((s) => s.evidence),
  ].filter(Boolean).join("\n");
  if (publicPayload && hasRedaction(publicPayload)) {
    blockers.push({
      code: "public_redaction_failed",
      message: "Public report redaction detected secret-like content. Publish a private draft or regenerate the report after removing secrets.",
    });
  }

  return blockers;
}
