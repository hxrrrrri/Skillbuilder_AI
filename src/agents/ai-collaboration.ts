import type { Evidence, Handoff, MissionState } from "./types";

const SYSTEM = `You are the AI Collaboration evaluator for SkillProof AI.
Score only when repository, terminal, commit, or challenge evidence shows how the candidate verifies AI-assisted work.
If evidence is insufficient, return an insufficient-evidence result instead of inventing a score.`;

export type AICollaborationReviewOutput = {
  aiCollaborationScore: number | null;
  aiVerificationScore: number | null;
  aiBlindCopyRisk: "low" | "medium" | "high" | "insufficient_evidence";
  aiDebuggingScore: number | null;
  aiPromptingSignal: "weak" | "moderate" | "strong" | "insufficient_evidence";
  aiResponsibleUseSummary: string;
  evidence: Evidence[];
  score_source: "deterministic" | "not_measured";
};

function commitLooksAiRelated(message: string): boolean {
  return /\b(ai|chatgpt|claude|copilot|generated|prompt)\b/i.test(message);
}

export async function runAICollaborationReview(state: MissionState): Promise<Handoff<AICollaborationReviewOutput>> {
  if (!state.context_pack) throw new Error("ai-collaboration: context_pack missing");

  const commits = state.context_pack.commits.filter((c) => commitLooksAiRelated(c.message));
  const terminalTests = (state.terminal_evidence ?? []).filter((t) =>
    ["testing", "typecheck", "build", "lint"].includes(String(t.usedFor)) && t.exitCode === 0
  );
  const evidence: Evidence[] = [];

  for (const commit of commits.slice(0, 3)) {
    evidence.push({
      reason: `AI-related commit message observed: ${commit.message.split(/\r?\n/)[0]}`,
      source: "deterministic",
      confidence: 0.55,
    });
  }
  for (const terminal of terminalTests.slice(0, 3)) {
    evidence.push({
      reason: `Verification command passed after repository intake: ${terminal.command} exit=0`,
      source: "terminal",
      confidence: 0.75,
    });
  }

  if (evidence.length === 0) {
    const out: AICollaborationReviewOutput = {
      aiCollaborationScore: null,
      aiVerificationScore: null,
      aiBlindCopyRisk: "insufficient_evidence",
      aiDebuggingScore: null,
      aiPromptingSignal: "insufficient_evidence",
      aiResponsibleUseSummary: "AI collaboration evidence insufficient.",
      evidence: [],
      score_source: "not_measured",
    };
    return {
      agent: "ai-collaboration",
      completed: ["ai_collaboration_reviewed"],
      unresolved: ["AI collaboration evidence insufficient."],
      evidence: [{ reason: "AI collaboration evidence insufficient.", source: "not_measured", confidence: 0.4 }],
      issues_found: ["AI collaboration evidence insufficient."],
      next_recommended: "git-evidence",
      output: out,
    };
  }

  const hasVerification = terminalTests.length > 0;
  const score = Math.min(85, 50 + commits.length * 5 + terminalTests.length * 8);
  const out: AICollaborationReviewOutput = {
    aiCollaborationScore: score,
    aiVerificationScore: hasVerification ? Math.min(90, 60 + terminalTests.length * 10) : 45,
    aiBlindCopyRisk: hasVerification ? "low" : "medium",
    aiDebuggingScore: terminalTests.some((t) => t.usedFor === "testing") ? 70 : null,
    aiPromptingSignal: commits.length >= 2 ? "moderate" : "weak",
    aiResponsibleUseSummary: hasVerification
      ? "AI-related workflow signals are paired with local verification commands."
      : "AI-related workflow signals exist, but verification evidence is thin.",
    evidence,
    score_source: "deterministic",
  };

  state.scores.push({
    skill: "AI Collaboration",
    score,
    evidence,
    confidence: hasVerification ? 0.65 : 0.45,
    source: "deterministic",
    strengths: hasVerification ? ["Uses checks after AI-related work."] : [],
    weaknesses: hasVerification ? [] : ["AI-related work is not paired with enough test/build evidence."],
  });

  state.aiCollaboration = {
    correctness_score: out.aiVerificationScore ?? score,
    explanation_quality_score: out.aiPromptingSignal === "moderate" ? 65 : 50,
    test_awareness_score: hasVerification ? 75 : 35,
    review_discipline_score: hasVerification ? 75 : 40,
    ai_collaboration_maturity_score: score,
    overall_score: score,
    tool_used: "repository evidence",
    feedback: out.aiResponsibleUseSummary,
    what_this_proves: [
      "Measures whether the candidate can use AI as an engineering amplifier without blindly trusting generated code.",
    ],
    evidence,
  };

  return {
    agent: "ai-collaboration",
    completed: ["ai_collaboration_reviewed"],
    unresolved: [],
    evidence,
    issues_found: hasVerification ? [] : ["AI collaboration verification evidence is limited."],
    next_recommended: "git-evidence",
    output: out,
  };
}
