// Markdown report builder. Pure function — no DB access here.

type Score = {
  skillName: string;
  score: number;
  confidence: number;
  scoreSource: string;
  evidence: string;
  validatorNotes: string | null;
};

type Question = {
  question: string;
  sourceFile: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  answer: string | null;
  answerScore: number | null;
  feedback: string | null;
  dimensionScores: string | null;
};

type RunBundle = {
  id: string;
  status: string;
  overallScore: number | null;
  roleFit: string | null;
  verificationLevel: string;
  targetRole: string;
  candidateLevel: string | null;
  validationContract: string | null;
  validationCoverage: string | null;
  validationSummary?: string | null;
  repoIntelligence?: string | null;
  authenticitySignals: string | null;
  improvementPlan: string | null;
  employerVerifier: string | null;
  profileSummary: string | null;
  aiCollaboration: string | null;
  executionMode: string | null;
  terminalEvidence: string | null;
  providerMatrix: string | null;
  ownershipStatus: string | null;
  createdAt: Date;
  completedAt: Date | null;
  repository: { owner: string; repoName: string; repoUrl: string };
  candidate: { name: string; githubUsername: string | null } | null;
  scores: Score[];
  questions: Question[];
};

function safe<T>(s: string | null, fb: T): T {
  if (!s) return fb;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fb;
  }
}

export function buildMarkdownReport(run: RunBundle): string {
  const lines: string[] = [];
  const candidateName = run.candidate?.name ?? "Anonymous Candidate";
  const repoStr = `${run.repository.owner}/${run.repository.repoName}`;

  lines.push(`# SkillProof Report — ${candidateName}`);
  lines.push("");
  lines.push(`> Generated ${new Date().toISOString().slice(0, 10)} · Run \`${run.id}\``);
  lines.push("");
  lines.push("## Candidate");
  lines.push(`- **Name:** ${candidateName}`);
  if (run.candidate?.githubUsername) lines.push(`- **GitHub:** [@${run.candidate.githubUsername}](https://github.com/${run.candidate.githubUsername})`);
  lines.push(`- **Target role:** ${run.targetRole}`);
  if (run.candidateLevel) lines.push(`- **Level:** ${run.candidateLevel}`);
  lines.push("");
  lines.push("## Repository");
  lines.push(`- **Repo:** [${repoStr}](${run.repository.repoUrl})`);
  lines.push(`- **Analyzed:** ${run.completedAt ? new Date(run.completedAt).toISOString() : "in progress"}`);
  lines.push("");

  lines.push("## Verification");
  lines.push(`- **Overall SkillProof Score:** ${run.overallScore ?? "—"}/100`);
  lines.push(`- **Role fit:** ${run.roleFit ?? "—"}`);
  lines.push(`- **Verification level:** ${run.verificationLevel === "repo_interview_verified" ? "Repo + Interview verified" : "Repo-only verified"}`);
  if (run.executionMode) lines.push(`- **Execution mode:** ${run.executionMode}`);
  const ownership = safe<any>(run.ownershipStatus, null);
  if (ownership) {
    const tags: string[] = [];
    if (ownership.owner_match) tags.push("owner_match (gh)");
    if (ownership.repo_token_verified) tags.push("repo_token_verified");
    if (ownership.collaborator_verified) tags.push("collaborator_verified");
    if (ownership.self_declared) tags.push("self_declared");
    if (tags.length) lines.push(`- **Ownership:** ${tags.join(", ")}`);
    if (ownership.verification_method) lines.push(`- **Ownership method:** ${ownership.verification_method}`);
  }
  lines.push("");

  const providerMatrix = safe<Record<string, string>>(run.providerMatrix, {});
  if (Object.keys(providerMatrix).length) {
    lines.push("## Provider Matrix");
    lines.push("");
    lines.push("| Role | Provider |");
    lines.push("|---|---|");
    for (const [role, prov] of Object.entries(providerMatrix)) {
      lines.push(`| ${role} | \`${prov}\` |`);
    }
    lines.push("");
  }

  const terminal = safe<any[]>(run.terminalEvidence, []);
  if (terminal.length) {
    lines.push("## Terminal Evidence");
    lines.push("");
    lines.push("Commands executed locally. Token patterns redacted.");
    lines.push("");
    for (const t of terminal) {
      lines.push(`### \`${t.command}\` _(${t.usedFor})_`);
      lines.push(`- exit code: \`${t.exitCode ?? "?"}\` · ${t.durationMs}ms · cwd: \`${t.cwd}\``);
      if (t.stdoutSummary) {
        lines.push("```");
        lines.push(String(t.stdoutSummary).slice(0, 1500));
        lines.push("```");
      }
      if (t.stderrSummary) {
        lines.push("_stderr:_");
        lines.push("```");
        lines.push(String(t.stderrSummary).slice(0, 800));
        lines.push("```");
      }
      lines.push("");
    }
  }

  const contract = safe<any>(run.validationContract, null);
  if (contract?.assertions?.length) {
    lines.push("## Validation Contract");
    lines.push("Defined BEFORE analysis — correctness independent of implementation.");
    lines.push("");
    for (const a of contract.assertions) {
      lines.push(`- **${a.id}** (${a.dimension}, w=${a.weight}): ${a.statement}`);
    }
    lines.push("");
  }

  const coverage = safe<any[]>(run.validationCoverage, []);
  const coverageSummary = safe<any>(run.validationSummary ?? null, null);
  if (coverage.length) {
    lines.push("## Validation Coverage");
    lines.push("");
    if (coverageSummary) {
      lines.push(`Assertions: ${coverageSummary.total} · passed ${coverageSummary.passed} · partial ${coverageSummary.partial} · failed ${coverageSummary.failed} · unknown ${coverageSummary.unknown} · evidence coverage ${coverageSummary.evidence_coverage_percentage}%`);
      lines.push("");
    }
    lines.push("| ID | Dimension | Status | Confidence | Notes |");
    lines.push("|---|---|---|---|---|");
    for (const c of coverage) {
      lines.push(`| ${c.assertion_id} | ${c.dimension} | ${c.status} | ${c.confidence != null ? `${Math.round(c.confidence * 100)}%` : "—"} | ${(c.notes ?? "").replace(/\|/g, "\\|")} |`);
    }
    lines.push("");
  }

  const intel = safe<any>(run.repoIntelligence ?? null, null);
  if (intel) {
    lines.push("## Repository Intelligence");
    lines.push(`- Files indexed: ${intel.files?.length ?? 0}`);
    lines.push(`- Frameworks: ${(intel.frameworks ?? []).join(", ") || "none detected"}`);
    lines.push(`- Package managers: ${(intel.packageManagers ?? []).join(", ") || "none detected"}`);
    lines.push(`- Routes: ${intel.routes?.length ?? 0}; components: ${intel.components?.length ?? 0}; functions: ${intel.functions?.length ?? 0}; tests: ${intel.testFiles?.length ?? 0}; configs: ${intel.configFiles?.length ?? 0}`);
    if (intel.riskFlags?.length) {
      lines.push("- Risk flags:");
      for (const r of intel.riskFlags.slice(0, 10)) lines.push(`  - ${r.severity}: ${r.reason}${r.file ? ` (${r.file})` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Skill Graph");
  lines.push("");
  lines.push("| Skill | Score | Confidence | Source |");
  lines.push("|---|---|---|---|");
  for (const s of run.scores) {
    lines.push(`| ${s.skillName} | ${s.score < 0 ? "not measured" : `${s.score}/100`} | ${Math.round(s.confidence * 100)}% | ${s.scoreSource} |`);
  }
  lines.push("");

  lines.push("## Evidence Locker");
  lines.push("");
  for (const s of run.scores) {
    const ev = safe<any[]>(s.evidence, []);
    if (s.score < 0) continue;
    lines.push(`### ${s.skillName} — ${s.score}/100`);
    if (ev.length === 0) {
      lines.push("- _no evidence cited_");
    } else {
      for (const e of ev) {
        const range = e.line_start ? `:${e.line_start}${e.line_end && e.line_end !== e.line_start ? `-${e.line_end}` : ""}` : e.line ? `:${e.line}` : "";
        const file = e.file ? `\`${e.file}${range}\` — ` : "";
        const source = e.source ? `_${e.source}_ — ` : "";
        lines.push(`- ${file}${source}${e.reason}`);
        if (e.snippet) {
          lines.push("  ```");
          lines.push(String(e.snippet).slice(0, 800).replace(/\n/g, "\n  "));
          lines.push("  ```");
        }
        if (e.validator_note) lines.push(`  - validator: ${e.validator_note}`);
      }
    }
    if (s.validatorNotes) lines.push(`- _validator: ${s.validatorNotes}_`);
    lines.push("");
  }

  const authenticity = safe<any>(run.authenticitySignals, null);
  if (authenticity) {
    lines.push("## Authenticity Signals");
    lines.push(`- **Score:** ${authenticity.authenticity_score}/100 (confidence ${Math.round((authenticity.confidence ?? 0) * 100)}%)`);
    if (authenticity.positive_signals?.length) {
      lines.push("");
      lines.push("**Positive:**");
      for (const p of authenticity.positive_signals) lines.push(`- ${p}`);
    }
    if (authenticity.risk_signals?.length) {
      lines.push("");
      lines.push("**Risks:**");
      for (const p of authenticity.risk_signals) lines.push(`- ${p}`);
    }
    lines.push("");
  }

  if (run.questions.some((q) => q.answer)) {
    lines.push("## Interview Performance");
    lines.push("");
    for (const q of run.questions.filter((q) => q.answer)) {
      lines.push(`### ${q.question}`);
      if (q.sourceFile) {
        const range = q.lineStart ? `:${q.lineStart}${q.lineEnd && q.lineEnd !== q.lineStart ? `-${q.lineEnd}` : ""}` : "";
        lines.push(`_Source file:_ \`${q.sourceFile}${range}\``);
      }
      lines.push("");
      lines.push("**Answer:**");
      lines.push("");
      lines.push("> " + (q.answer ?? "").replace(/\n/g, "\n> "));
      lines.push("");
      if (q.answerScore != null) lines.push(`**Score:** ${q.answerScore}/100`);
      if (q.feedback) lines.push(`**Feedback:** ${q.feedback}`);
      const dims = safe<any>(q.dimensionScores, null);
      if (dims) {
        lines.push("");
        lines.push("| Dimension | Score |");
        lines.push("|---|---|");
        for (const [k, v] of Object.entries(dims)) lines.push(`| ${k.replace(/_/g, " ")} | ${v}/100 |`);
      }
      lines.push("");
    }
  }

  const ai = safe<any>(run.aiCollaboration, null);
  if (ai) {
    lines.push("## AI Collaboration Challenge");
    lines.push(`- **Tool used:** ${ai.tool_used ?? "—"}`);
    lines.push(`- **Overall:** ${ai.overall_score}/100`);
    lines.push(`- Correctness: ${ai.correctness_score}/100, Explanation: ${ai.explanation_quality_score}/100, Test awareness: ${ai.test_awareness_score}/100, Review discipline: ${ai.review_discipline_score}/100, Maturity: ${ai.ai_collaboration_maturity_score}/100`);
    if (ai.target_files?.length) lines.push(`- **Target files:** ${ai.target_files.join(", ")}`);
    if (ai.what_this_proves?.length) {
      lines.push("- **What this proves:**");
      for (const p of ai.what_this_proves) lines.push(`  - ${p}`);
    }
    if (ai.feedback) lines.push(`- _${ai.feedback}_`);
    lines.push("");
  }

  const employer = safe<any>(run.employerVerifier, null);
  if (employer) {
    lines.push("## Employer Verifier");
    lines.push(`- **Recommendation:** ${employer.hiring_recommendation}`);
    lines.push(`- **Role fit:** ${employer.role_fit_summary}`);
    if (employer.top_verified_skills?.length) lines.push(`- **Top verified skills:** ${employer.top_verified_skills.join(", ")}`);
    if (employer.biggest_risks?.length) {
      lines.push(``);
      lines.push("**Biggest risks:**");
      for (const r of employer.biggest_risks) lines.push(`- ${r}`);
    }
    if (employer.suggested_followup_questions?.length) {
      lines.push("");
      lines.push("**Suggested follow-up questions:**");
      for (const q of employer.suggested_followup_questions) lines.push(`- ${q}`);
    }
    lines.push("");
  }

  const plan = safe<any>(run.improvementPlan, null);
  if (plan) {
    lines.push("## Improvement Plan");
    if (plan.seven_day?.length) {
      lines.push("**7-day:**");
      for (const p of plan.seven_day) lines.push(`- ${p}`);
      lines.push("");
    }
    if (plan.thirty_day?.length) {
      lines.push("**30-day:**");
      for (const p of plan.thirty_day) {
        lines.push(`- **Week ${p.week} — ${p.title}.** ${p.detail}${p.files?.length ? ` (files: ${p.files.join(", ")})` : ""}`);
      }
      lines.push("");
    }
    if (plan.recommended_tests?.length) {
      lines.push("**Recommended tests:**");
      for (const t of plan.recommended_tests) lines.push(`- ${t}`);
      lines.push("");
    }
    if (plan.git_hygiene?.length) {
      lines.push("**Git hygiene:**");
      for (const g of plan.git_hygiene) lines.push(`- ${g}`);
      lines.push("");
    }
  }

  const profile = safe<any>(run.profileSummary, null);
  if (profile?.developer_summary) {
    lines.push("## Developer Summary");
    lines.push(profile.developer_summary);
    lines.push("");
  }

  lines.push("---");
  lines.push("_Generated by SkillProof AI — verification of real GitHub work, not resumes._");
  lines.push("");
  lines.push("_Limitations: this report reflects accessible repository content, terminal transcripts, interview answers, and challenge submissions. It is not a background check, employment guarantee, or complete security audit._");
  if (run.executionMode && run.executionMode !== "api") {
    lines.push("");
    lines.push(
      `_Privacy note: this run used \`${run.executionMode}\` mode. Local CLI and terminal evidence stayed on the candidate's machine. Token patterns redacted in outputs above._`,
    );
  }

  return lines.join("\n");
}
