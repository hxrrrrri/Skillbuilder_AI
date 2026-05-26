import { extractJson, isMockMode, llmCall } from "@/lib/claude";
import { buildCommitsBlock } from "./_analysis";
import type { GitEvidenceOutput, Handoff, MissionState, ValidationAssertionResult } from "./types";

const SYSTEM = `You are the Git Evidence agent of SkillProof AI.
Judge real development behavior from the commit log only.
Return STRICT JSON:
{
  "git_workflow_score": number (0-100),
  "commit_count": number,
  "avg_msg_quality": number (0-100),
  "evidence": [{"reason": string}]
}`;

function gradeMsg(msg: string): number {
  const first = msg.split("\n")[0].trim();
  if (first.length < 8) return 20;
  if (/^(wip|update|fix|stuff|things|asdf|test|tmp)\.?$/i.test(first)) return 30;
  if (first.length > 72) return 55;
  if (/^[a-z]+(\([^)]+\))?: /.test(first)) return 90;
  return 65;
}

function fallback(state: MissionState): GitEvidenceOutput {
  const commits = state.context_pack!.commits;
  const avg = commits.length ? commits.reduce((s, c) => s + gradeMsg(c.message), 0) / commits.length : 0;
  return {
    git_workflow_score: commits.length === 0 ? 30 : Math.round(0.6 * avg + 0.4 * Math.min(100, commits.length * 3)),
    commit_count: commits.length,
    avg_msg_quality: Math.round(avg),
    evidence: [
      { reason: `${commits.length} recent commits sampled.` },
      { reason: `Avg commit message quality heuristic: ${Math.round(avg)}.` },
    ],
    score_source: "heuristic",
  };
}

function deriveAssertionResults(state: MissionState, out: GitEvidenceOutput): ValidationAssertionResult[] {
  const contract = state.contract;
  if (!contract) return [];
  return contract.assertions
    .filter((a) => a.dimension === "git_workflow")
    .map((a) => ({
      assertion_id: a.id,
      dimension: a.dimension,
      statement: a.statement,
      status: out.git_workflow_score >= 60 ? "passed" : out.git_workflow_score >= 45 ? "partial" : "failed",
      evidence: out.evidence.slice(0, 2),
      responsible_agent: "git-evidence",
      notes: `${out.commit_count} commits, avg msg quality ${out.avg_msg_quality}.`,
    }) as ValidationAssertionResult);
}

export async function runGitEvidence(state: MissionState): Promise<Handoff<GitEvidenceOutput>> {
  if (!state.context_pack) throw new Error("git-evidence: context_pack missing");
  let out: GitEvidenceOutput;
  let tin = 0, tout = 0;

  if (isMockMode()) {
    out = { ...fallback(state), score_source: state.mock_mode ? "mock" : "heuristic" };
  } else {
    const user = `${buildCommitsBlock(state.context_pack)}

Return the JSON now.`;
    try {
      const r = await llmCall({ role: "worker", system: SYSTEM, user, maxTokens: 900 });
      tin = r.inputTokens;
      tout = r.outputTokens;
      const parsed = extractJson<GitEvidenceOutput>(r.text);
      out = parsed ? { ...parsed, score_source: "llm" } : { ...fallback(state), score_source: "heuristic" };
    } catch {
      out = { ...fallback(state), score_source: "heuristic" };
    }
  }

  out.assertion_results = deriveAssertionResults(state, out);

  state.tokens_in += tin;
  state.tokens_out += tout;
  state.scores.push({
    skill: "Git Workflow",
    score: out.git_workflow_score,
    evidence: out.evidence,
    confidence: out.score_source === "llm" ? 0.85 : 0.75,
    source: out.score_source ?? "heuristic",
    assertion_ids: out.assertion_results.map((a) => a.assertion_id),
  });
  state.assertion_results.push(...(out.assertion_results ?? []));

  return {
    agent: "git-evidence",
    completed: ["git_log_analyzed"],
    unresolved: [],
    evidence: out.evidence,
    issues_found: out.git_workflow_score < 50 ? ["Commit hygiene needs work."] : [],
    next_recommended: "documentation",
    assertion_results: out.assertion_results,
    output: out,
  };
}
