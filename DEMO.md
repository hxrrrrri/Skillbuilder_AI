# SkillProof AI — Hackathon Demo Script

> **Most students show resumes. SkillProof shows evidence.**

This is the 5–7 minute demo flow. Each step maps to a piece of the Missions architecture you'll
see on screen.

---

## Setup

```bash
npm install
npm run db:push
npm run dev
# open http://localhost:3000
```

Optional:

```bash
export ANTHROPIC_API_KEY=...     # real Claude mode
# OR
export SKILLPROOF_MOCK_LLM=1     # offline heuristic mode (UI shows a yellow banner)
```

### Safety net — if anything fails live

Click **Open Demo Mission (sample data)** on the landing page, or hit
`GET /api/demo/seed` directly. This fabricates a complete mission with `executionMode=cli`,
provider matrix, terminal evidence, ownership=verified, skill scores, interview answer, and
challenge submission. The seeded profile lives at `/profile/demo`.

---

## Script

1. **Open `/local-setup`.** Show the detected tools panel — `git`, `gh`, `claude`, `codex`,
   `ollama`, optional `copilot`. Auth status, versions, capabilities. The page recommends an
   execution mode. **Provider matrix** shows which provider each agent role will use.

2. **Click `Test JSON output`** on a provider (e.g. `ollama` or `claude_cli`). The button posts to
   `/api/local/providers/test` with a tiny `{"ok": true}` prompt and shows the parsed JSON, the
   raw output, and the model. Useful because CLI flags drift between versions.

3. **Run a safe terminal command** in the sandbox console — e.g. `git --version`. Try a blocked
   command like `rm -rf /` — policy refuses. Try `npm install -g foo` — policy returns
   `approval_required`.

4. **Back to landing page.** Paste a public GitHub repo URL, name, optional GitHub username,
   target role, level. Pick **Local CLI Mode**.

5. **Run mission.** App redirects to Mission Control. Local Proof Runner clones the repo into
   `.skillproof/runs/<run_id>` and starts capturing terminal evidence: `git log`, `git shortlog`,
   `git branch`, `git status`, `git remote`, `pnpm test`, `pnpm build`, `pnpm typecheck`,
   security greps, `gh api user` for ownership.

6. **Mission Control shows agents lighting up.** Orchestrator → Repo Scanner → Architecture →
   Code Quality → Testing → Security → Git Evidence → Documentation → Authenticity →
   Interview Gen → Validator → Skill Graph → Profile Gen. Every agent calls through
   `runAgentJson`, which routes to the provider matrix — so a worker score might come from
   `ollama`, a validator score from `anthropic_api`, etc. Each agent emits a
   `provider=… model=…` evidence row.

7. **Terminal evidence affects scores.** Open the Testing card. If `pnpm test` exited 0, the
   testing score is at least 70 with cited terminal output. If it failed, score is capped at 45
   with the failure quoted. Same for Build → Code Quality, Typecheck → Code Quality, git
   commands → Git Workflow, security greps → Security findings.

8. **Evidence Locker.** Every score row shows source (`LLM` / `Heuristic` / `Mock`), confidence,
   cited files, terminal commands, validator notes, and which contract assertions it addresses.

9. **Ownership status.** Header shows a badge: `verified` (gh user matches repo owner),
   `self_declared` (username provided but not verified), or `unverified`. Public profile +
   Employer Verifier surface the same signal.

10. **Validation Contract Coverage.** Every assertion has a status: passed / partial / failed /
    unknown. Coverage rolls up assertion results from each worker.

11. **Authenticity Signals.** Positive vs risk signals. Not plagiarism detection.

12. **Own-code Interview.** Answer at least one question. Answer evaluator runs fresh-context.
    Verification level upgrades to **Repo + Interview verified**.

13. **AI Collaboration Challenge.** Paste diff + explanation + tool used. Routed through
    `runAgentJson` for the validator role — uses CLI provider if available.

14. **Publish profile.** Open the public URL. Recruiters see:
    - Verified badge, score, skill graph, evidence locker
    - **Local Proof section** — execution mode, ownership confidence, terminal command summary
      by `usedFor`, expandable command list, provider matrix
    - Employer Verifier with `terminal_proof_summary`, `shortlist_reason` / `caution_reason`,
      `confidence`, top verified skills, biggest risks, follow-up questions
    - Improvement plan

15. **Export Report.md.** The Markdown report includes provider matrix table, terminal evidence
    blocks with exit codes, ownership confidence, validation coverage, skill graph, evidence,
    authenticity, interview, AI collab, employer verifier, improvement plan. Token patterns
    redacted.

---

## What to emphasize verbally

- "Validation contract is written **before** the candidate's code is read."
- "Validator runs with fresh context. It cannot raise scores. The truth set is every file in the
  repo tree, not just what was sent to other agents."
- "In Local CLI mode the candidate's code never leaves their machine — agents call local CLIs."
- "Terminal evidence is real proof. We don't just say `tests exist` — we run them and quote the
  exit code."
- "Ownership verification via `gh` matches the authenticated user against the repo owner.
  Self-declared GitHub usernames are clearly labeled as unverified."
- "Heuristic/Mock mode is never hidden. Every score is tagged with its source and confidence."
- "Not measured ≠ 50. We refuse to silently fill in missing data."

---

## Failure modes to demo (optional)

- Paste a spoof URL like `https://github.com.evil.com/owner/repo` → rejected as `invalid_repo_url`.
- Try `rm -rf /` in the terminal sandbox → blocked as `destructive`.
- Stop Ollama mid-run → mission continues, agents fall back to next provider in the matrix or
  heuristic.
- Disable `ANTHROPIC_API_KEY` and switch to `mock` mode → yellow banner appears + scores badged
  `Mock`. Employer Verifier explicitly warns the matrix included mock.
