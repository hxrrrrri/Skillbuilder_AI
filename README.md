# SkillProof AI

**Proof-of-work hiring infrastructure for AI-native developers.**

> SkillProof AI converts real GitHub work into verified hiring evidence.
> It replaces "trust my resume" with "verify my work."

A candidate pastes a public GitHub repo. A mission of specialist agents writes a validation
contract, audits the code with token-efficient context, runs a fresh-context validator on every
score, generates own-code interview questions, evaluates candidate answers, and ships an
evidence-backed credibility profile employers can read in one minute.

---

## Product positioning

This is **not**:

- a resume scorer
- a generic GitHub analyzer
- a vibe check on a portfolio

This **is**:

- a verifiable, evidence-locker–backed credibility profile
- a validation contract written before any analysis runs
- a creator–verifier separation with adversarial audit
- an own-code interview that makes bluffing hard
- authenticity signals (not plagiarism detection)
- an employer verifier preview that says shortlist or no

---

## Architecture — Missions

Inspired by Factory's Missions architecture.

| Concept              | Implementation                                                      |
| -------------------- | ------------------------------------------------------------------- |
| Orchestrator         | [src/agents/orchestrator.ts](src/agents/orchestrator.ts)            |
| Workers              | architecture, code-quality, testing, security, git-evidence, documentation, authenticity |
| Validators           | [src/agents/validator.ts](src/agents/validator.ts) (fresh context, truth set = full repo tree) + [src/agents/answer-evaluator.ts](src/agents/answer-evaluator.ts) |
| Validation contract  | [src/agents/types.ts](src/agents/types.ts) — written before analysis |
| Structured handoffs  | `Handoff` in [src/agents/types.ts](src/agents/types.ts)              |
| Serial execution     | [src/agents/mission-runner.ts](src/agents/mission-runner.ts)         |
| Mission Control      | [src/app/mission/[id]/page.tsx](src/app/mission/%5Bid%5D/page.tsx)  |
| Per-role models      | env: `MODEL_ORCHESTRATOR`, `MODEL_WORKER`, `MODEL_VALIDATOR`         |

### Pipeline order

```
orchestrator → repo-scanner → architecture → code-quality → testing → security
→ git-evidence → documentation → authenticity → interview-gen
→ validator → skill-graph → profile-gen
```

---

## Token efficiency

The Repo Scanner does deterministic, non-LLM analysis via the GitHub REST API and produces a small
context pack: README, configs, file tree summary, top-ranked source files, sampled test files,
commits. The validator's truth set is the **full repo tree** (`filesIndex.all`), not just snippets.
Mission Control surfaces `tokens raw` vs `tokens used` and a saved percentage.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env
# edit .env — set ANTHROPIC_API_KEY for real-LLM mode,
# or leave it unset / set SKILLPROOF_MOCK_LLM=1 for heuristic/mock mode.

# 3. Init local SQLite db
npm run db:push

# 4. Run dev server
npm run dev
# open http://localhost:3000

# 5. (optional) Type-check and run tests
npm run check
```

---

## Environment variables

| Var                   | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`        | SQLite URL, e.g. `file:./dev.db`                              |
| `ANTHROPIC_API_KEY`   | Claude API key — leave unset to use heuristic / mock mode.    |
| `SKILLPROOF_MOCK_LLM` | Force mock mode (`1`).                                        |
| `GITHUB_TOKEN`        | Optional. Raises GitHub REST rate limit 60 → 5000/hr.         |
| `MODEL_ORCHESTRATOR`  | Default `claude-opus-4-7`.                                    |
| `MODEL_WORKER`        | Default `claude-sonnet-4-6`.                                  |
| `MODEL_VALIDATOR`     | Default `claude-opus-4-7`.                                    |
| `NEXT_PUBLIC_APP_URL` | Base URL used when publishing profile URLs.                   |

---

## Local demo mode vs mock mode

- **Real LLM mode** — set `ANTHROPIC_API_KEY`. Workers + validators call Claude.
- **Mock / heuristic mode** — no key, or `SKILLPROOF_MOCK_LLM=1`. Mission Control surfaces a
  yellow "Mock / Heuristic mode active" banner and tags every score with a `Heuristic` or `Mock`
  badge. Scores are deterministic and confidence is reduced. The product never pretends
  fallback scores are fully verified.

---

## API routes

| Method | Path                          | Purpose                                              |
| ------ | ----------------------------- | ---------------------------------------------------- |
| POST   | `/api/analyze`                | Start a mission. Body: `repo_url`, `candidate_name`, `github_username?`, `target_role`, `candidate_level`, `job_description?` |
| GET    | `/api/runs/[id]`              | Poll mission status. Returns scores, events, contract, coverage, authenticity, employer verifier, plan, etc. |
| POST   | `/api/interview/evaluate`     | Score an interview answer; persists 5 dimension scores, recomputes overall, updates verification level. |
| POST   | `/api/challenge/evaluate`     | Score an AI Collaboration Challenge submission (`tool_used`, `proposed_diff`, `explanation`). |
| POST   | `/api/profile/publish`        | Create a public profile slug for a completed run.    |
| GET    | `/api/report/export?run_id=…` | Download the Markdown SkillProof Report.             |

---

## Scoring rubric

```
Code Quality       15
Architecture       15
Testing            15
Debugging          15  (interview-driven)
Git Workflow       10
Documentation      10
Security           10
Communication       5  (interview-driven)
AI Collaboration    5  (challenge-driven)
```

Skills with no measurement are reported `not measured` and **excluded from the overall denominator**
— SkillProof never silently fills in a neutral 50.

---

## Tests

```bash
npm run typecheck     # tsc --noEmit
npm run test          # vitest run
npm run check         # both
```

Covered:

- `parseRepoUrl`, `slugify`, `clamp`, `safeJsonParse`
- `estimateTokens`, `estimateBytesTokens`, `buildLedger`
- `encodeRepoPath` (the bug-fixed GitHub contents helper)
- Validator heuristic logic (no-evidence lowering, hallucinated-file flagging, score capping,
  truth set drawn from full repo tree, assertion-coverage rollup)
- Skill-graph weighted aggregation, `not_measured`, and `recomputeOverall`

---

## Known limitations

- Mission runner is in-process. Production deploys should swap `runMission` for a queue.
- Private repos are not supported — public repos only.
- AI Collaboration challenge does not modify the candidate's repo; it scores a pasted diff.
- Campus dashboard at `/campus-preview` is sample data, clearly labeled.
- Authenticity signals are heuristics — explicitly **not** plagiarism detection.

---

## Future roadmap

- Real queue + worker for mission execution
- Re-verification (delta between runs over time)
- Cryptographic signed badge embed for LinkedIn / portfolios
- Recruiter API: pay-per-shortlist with ATS handoff (Greenhouse / Lever / Workday)
- College / bootcamp tenant for cohort dashboard (currently preview only)

---

## Demo

See [DEMO.md](DEMO.md) for the hackathon demo script.

## Monetization

- **Free** — 1 public verified profile
- **Student Pro** — unlimited analyses, growth tracking, re-verification
- **College / Bootcamp SaaS** — placement dashboard, recruiter export
- **Recruiter API** — pay-per-verified-shortlist, ATS integration
- **Verified Badge Embed** — cryptographic signature on LinkedIn / portfolio sites

---

## Screenshots

_Placeholders — to be added before submission._

- Landing page
- Mission Control with validation contract coverage
- Evidence Locker
- Public verified profile
- Employer Verifier preview
- Campus preview
