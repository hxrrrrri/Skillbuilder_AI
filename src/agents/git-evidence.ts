import { extractJson, isMockMode, llmCall } from "@/lib/claude";
import { buildCommitsBlock } from "./_analysis";
import type { GitEvidenceOutput, Handoff, MissionState } from "./types";

const SYSTEM = `You are the Git Evidence agent of SkillProof AI.
Judge the candidate's real development behavior from the commit log only.
Return STRICT JSON:
{
  "git_workflow_score": number (0-100),
  "commit_count": number,
  "avg_msg_quality": number (0-100),
  "evidence": [{"reason": string}]
}
Reward incremental commits, descriptive messages, sustained activity, conventional commit style.
Penalize "fix"/"update" floods, one-shot "initial commit" dumps, multi-month gaps with single mega-commit.`;

function gradeMsg(msg: string): number {
  const first = msg.split("\n")[0].trim();
  if (first.length < 8) return 20;
  if (/^(wip|update|fix|stuff|things|asdf|test|tmp)\.?$/i.test(first)) return 30;
  if (first.length > 72) return 55;
  if (/^[a-z]+(\([^)]+\))?: /.test(first)) return 90; // conventional
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
      { reason: `Average commit message quality heuristic: ${Math.round(avg)}.` },
    ],
  };
}

export async function runGitEvidence(state: MissionState): Promise<Handoff<GitEvidenceOutput>> {
  if (!state.context_pack) throw new Error("git-evidence: context_pack missing");
  let out: GitEvidenceOutput;
  let tin = 0,
    tout = 0;

  if (isMockMode()) {
    out = fallback(state);
  } else {
    const user = `${buildCommitsBlock(state.context_pack)}

Return the JSON now.`;
    try {
      const r = await llmCall({ role: "worker", system: SYSTEM, user, maxTokens: 900 });
      tin = r.inputTokens;
      tout = r.outputTokens;
      out = extractJson<GitEvidenceOutput>(r.text) ?? fallback(state);
    } catch {
      out = fallback(state);
    }
  }

  state.tokens_in += tin;
  state.tokens_out += tout;
  state.scores.push({
    skill: "Git Workflow",
    score: out.git_workflow_score,
    evidence: out.evidence,
  });

  return {
    agent: "git-evidence",
    completed: ["git_log_analyzed"],
    unresolved: [],
    evidence: out.evidence,
    issues_found: out.git_workflow_score < 50 ? ["Commit hygiene needs work."] : [],
    next_recommended: "interview-gen",
    output: out,
  };
}
