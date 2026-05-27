import { runAgentJson } from "@/lib/providers/run-agent";
import { buildCommitsBlock } from "./_analysis";
import { getTerminalEvidence } from "@/lib/local-runner/evidence-analysis";
import { assertionResultsForDimension } from "./assertions";
import type { Evidence, GitEvidenceOutput, Handoff, MissionState, ValidationAssertionResult } from "./types";

const SYSTEM = `You are the Git Evidence agent of SkillProof AI.
Judge real development behavior from the commit log only.
Return STRICT JSON:
{
  "git_workflow_score": number (0-100),
  "commit_count": number,
  "avg_msg_quality": number (0-100),
  "evidence": [{"reason": string}]
}`;

const SCHEMA_HINT = '{"git_workflow_score":number,"commit_count":number,"avg_msg_quality":number,"evidence":[{"reason":string}]}';

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
      { reason: `${commits.length} recent commits sampled.`, source: "github_api" },
      { reason: `Avg commit message quality heuristic: ${Math.round(avg)}.`, source: "heuristic" },
    ],
    score_source: "heuristic",
  };
}

function deriveAssertionResults(state: MissionState, out: GitEvidenceOutput): ValidationAssertionResult[] {
  return assertionResultsForDimension({
    state,
    dimension: "git_workflow",
    agent: "git-evidence",
    evidence: out.evidence,
    passed: () => out.commit_count >= 3 && out.avg_msg_quality >= 55,
    failed: () => out.commit_count === 0,
    partial: () => out.commit_count > 0,
    baseNote: `${out.commit_count} commits, avg msg quality ${out.avg_msg_quality}.`,
  });
}

// Prefer local git log/shortlog evidence when available.
function applyTerminalEvidence(state: MissionState, out: GitEvidenceOutput) {
  const evidence = getTerminalEvidence(state, "git");
  if (!evidence.length) return;
  const extra: Evidence[] = [];
  let bonus = 0;
  for (const e of evidence) {
    if (e.exitCode === 0) {
      bonus += 3;
      extra.push({
        reason: `terminal · git · \`${e.command}\` exit=0`,
        snippet: (e.stdoutSummary || "").slice(0, 200),
        source: "terminal",
      });
      // Count lines as commit signal when shortlog/log used.
      if (/shortlog|log/.test(e.command)) {
        const lines = (e.stdoutSummary || "").split(/\r?\n/).filter((l) => l.trim().length > 0).length;
        if (lines > out.commit_count) out.commit_count = lines;
      }
    } else if (e.exitCode !== null) {
      extra.push({
        reason: `terminal · git FAILED · \`${e.command}\` exit=${e.exitCode}`,
        source: "terminal",
      });
    }
  }
  out.git_workflow_score = Math.min(100, out.git_workflow_score + Math.min(bonus, 8));
  out.evidence = [...out.evidence, ...extra];
}

export async function runGitEvidence(state: MissionState): Promise<Handoff<GitEvidenceOutput>> {
  if (!state.context_pack) throw new Error("git-evidence: context_pack missing");

  const user = `${buildCommitsBlock(state.context_pack)}

Return the JSON now.`;

  const res = await runAgentJson<GitEvidenceOutput>({
    state,
    agentName: "git-evidence",
    role: "worker",
    system: SYSTEM,
    user,
    schemaHint: SCHEMA_HINT,
    maxTokens: 900,
    fallback: () => fallback(state),
  });

  const out: GitEvidenceOutput = { ...res.output, score_source: res.source };
  out.evidence = (out.evidence ?? []).map((e) => ({ ...e, source: e.source ?? "github_api" }));
  applyTerminalEvidence(state, out);
  out.assertion_results = deriveAssertionResults(state, out);

  state.tokens_in += res.inputTokens;
  state.tokens_out += res.outputTokens;
  state.scores.push({
    skill: "Git Workflow",
    score: out.git_workflow_score,
    evidence: out.evidence,
    confidence: res.source === "llm" ? 0.85 : 0.75,
    source: res.source,
    assertion_ids: out.assertion_results.map((a) => a.assertion_id),
  });
  state.assertion_results.push(...(out.assertion_results ?? []));

  return {
    agent: "git-evidence",
    completed: ["git_log_analyzed"],
    unresolved: [],
    evidence: [
      ...out.evidence,
      { reason: `provider=${res.provider} model=${res.model}` },
    ],
    issues_found: out.git_workflow_score < 50 ? ["Commit hygiene needs work."] : [],
    next_recommended: "documentation",
    assertion_results: out.assertion_results,
    output: out,
  };
}
