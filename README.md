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
commits, plus a deterministic `RepoIntelligenceIndex` with languages, frameworks, routes,
components, functions, schemas, API clients, tests, config/CI files, dependency edges, and risk
flags. The validator's truth set is the **full repo tree** (`filesIndex.all`), not just snippets.
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

# 5. (optional) Run checks
npm run typecheck
npm run test
npm run build

# 6. (optional) Worker mode instead of in-process missions
# terminal A
set SKILLPROOF_WORKER_MODE=1
npm run dev
# terminal B
npm run worker
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
| `SKILLPROOF_WORKER_MODE` | Set `1` to make `/api/analyze` enqueue only; run `npm run worker`. |
| `ALLOW_LOCAL_COMMANDS` | In production, `/api/local/command` is blocked unless set to `1`. |

---

## Local demo mode vs mock mode

- **Real LLM mode** — set `ANTHROPIC_API_KEY`. Workers + validators call Claude.
- **Mock / heuristic mode** — no key, or `SKILLPROOF_MOCK_LLM=1`. Mission Control surfaces a
  yellow "Mock / Heuristic mode active" banner and tags every score with a `Heuristic` or `Mock`
  badge. Scores are deterministic and confidence is reduced. The product never pretends
  fallback scores are fully verified.
- **Demo seed** — `GET /api/demo/seed` fabricates a complete mission (executionMode=`cli`,
  provider matrix, terminal evidence, ownership=verified, skill scores, interview answer,
  challenge submission, employer verifier). Used by the landing page **Open Demo Mission**
  button so the hackathon demo survives GitHub rate limits and missing CLIs. Clearly labeled
  as sample data.

---

## What is fully wired vs future work

| Status     | Capability                                                            |
| ---------- | --------------------------------------------------------------------- |
| ✅ Wired    | Provider mesh routes through `runAgentJson` in every agent.           |
| ✅ Wired    | Terminal evidence affects Testing / Build / Typecheck / Git / Security / Code Quality scores. |
| ✅ Wired    | Install & Verify policy detects lockfiles, asks for install approval in CLI/hybrid mode, and records skipped/passed/failed command evidence. |
| ✅ Wired    | Deterministic repo intelligence index feeds agents, interview generation, validator, UI, and reports. |
| ✅ Wired    | Evidence supports file, line range, snippet, SHA-256 hash, source type, confidence, and validator notes. |
| ✅ Wired    | Assertion-level validation coverage with passed/failed/partial/unknown counts and evidence coverage. |
| ✅ Wired    | Ownership status (`owner_match` / `repo_token_verified` / `self_declared` / `unverified`) shows in Mission, Public Profile, Employer Verifier, Markdown report. |
| ✅ Wired    | GitHub ownership token flow via README or `.skillproof-verify.json`; `gh` owner match when available. |
| ✅ Wired    | Markdown report includes provider matrix, terminal evidence, ownership confidence. |
| ✅ Wired    | Public profile shows execution mode, ownership badge, local proof summary, provider matrix. |
| ✅ Wired    | Hardened command policy: destructive patterns block before allowlist; approval only lifts allowlisted commands. |
| ✅ Wired    | `parseRepoUrl` rejects spoof hosts like `github.com.evil.com`. |
| ✅ Wired    | Simple database-backed worker (`npm run worker`) processes pending missions. |
| ⏳ Future   | Private repo support via local folder upload — currently public GitHub URLs only. CLI mode keeps private code on the candidate's machine when used. |
| ⏳ Future   | Distributed queue/Redis deployment. Current worker is a single-process DB poller for prototypes. |
| ⏳ Future   | Cryptographic signed badge embed.                                      |

---

## Execution modes

SkillProof supports four execution modes — picked on the landing page and shown on each Mission.

| Mode     | What it does                                                                       | Needs                                |
| -------- | ---------------------------------------------------------------------------------- | ------------------------------------ |
| `api`    | Cloud API mode. Workers + validators call Anthropic.                               | `ANTHROPIC_API_KEY`                  |
| `cli`    | Local CLI mode. Uses installed local CLIs + the local Proof Runner. No API keys.   | `git`, optional `gh`, `claude`/`codex`/`ollama` |
| `hybrid` | Best available provider per agent role. Falls back to mock when nothing works.     | any of the above                     |
| `mock`   | Pure heuristic / deterministic. Stays on the machine.                              | nothing                              |

### Local-first verification

Visit [`/local-setup`](http://localhost:3000/local-setup) to see:

- which CLIs are installed (`git`, `gh`, `claude`, `codex`, `ollama`, optional `copilot`)
- auth status (e.g. `gh auth status`, Ollama model list)
- recommended execution mode
- the per-role **provider matrix** (`orchestrator` / `worker` / `validator` / `interview` / `profile`)
- a sandboxed terminal where you can test safe commands

The **Local Proof Runner** clones a candidate's public repo into `.skillproof/runs/<run_id>` and
runs safe checks. If `node_modules` is missing in CLI/hybrid mode, SkillProof shows an approval
checkbox before installing dependencies. When approved it detects the lockfile and runs:

- `npm ci` when `package-lock.json` exists, otherwise `npm install`
- `pnpm install --frozen-lockfile`
- `yarn install --frozen-lockfile`
- `bun install --frozen-lockfile`

After install it runs available scripts: `test`, `build`, `typecheck`/`type-check`, and `lint`.
If install is not approved or scripts are missing, Mission Control records explicit
`pending approval` / `skipped` terminal evidence. Skipped commands are never shown as proof.

### Required tools

- `git` — strongly recommended. Without it, no local clone or local git evidence.

### Optional tools

- `gh` — GitHub CLI. Authenticates ownership (`gh auth status` username vs repo owner) and lets
  the app call GitHub via the CLI instead of REST.
- `claude` — Claude Code CLI for LLM roles in `cli`/`hybrid` mode.
- `codex` — OpenAI Codex CLI for LLM roles.
- `ollama` — local LLM. Recommended fallback when no API key and no Claude/Codex CLI.
- `gh copilot` — optional Copilot CLI.

### Configure provider commands

Edit `skillproof.local.json` at the project root, or use the **Edit** button on `/local-setup`.

```json
{
  "providers": {
    "claude_cli": { "command": "claude", "args": ["-p", "{{prompt}}"], "enabled": true },
    "codex_cli":  { "command": "codex",  "args": ["exec", "{{prompt}}"], "enabled": true },
    "ollama":     { "model": "llama3.1:8b", "baseUrl": "http://localhost:11434", "enabled": true },
    "copilot_cli": { "command": "gh", "args": ["copilot", "suggest", "{{prompt}}"], "enabled": false }
  },
  "roles": {
    "orchestrator": ["claude_cli", "anthropic_api", "ollama", "mock"],
    "worker":       ["ollama", "claude_cli", "codex_cli", "anthropic_api", "mock"],
    "validator":    ["codex_cli", "anthropic_api", "claude_cli", "ollama", "mock"],
    "interview":    ["claude_cli", "anthropic_api", "ollama", "mock"],
    "profile":      ["anthropic_api", "claude_cli", "ollama", "mock"]
  }
}
```

If `{{prompt}}` is not present in `args`, the prompt is piped via stdin instead.

### Security model

- Local CLI mode can execute commands. Installs require explicit approval in CLI/hybrid missions.
- Allowlist: `git`, `gh`, `npm`/`pnpm`/`yarn`/`bun`, `node`, `python`/`pytest`, `tsc`, `eslint`,
  `claude`, `codex`, `ollama`, optional `copilot`.
- Blocked by default: `rm -rf`, `del /s`, `format`, `shutdown`, `mkfs`, `dd if=`, fork bombs,
  `curl | bash`, `iwr | iex`, `Invoke-Expression`, `Set-ExecutionPolicy`, env dumps, `.env`
  reads, `node -e`, and `python -c`.
- Requires explicit approval: global `-g` installs and arbitrary `npx <package>` runs. Approved
  package-manager dependency installs are only run by the local proof policy.
- `/api/local/command` is jailed to `.skillproof/runs/<run_id>` and is disabled in production
  unless `ALLOW_LOCAL_COMMANDS=1`.
- Terminal output is redacted for token shapes before persistence: `sk-…`, `sk-ant-…`, `ghp_…`,
  `github_pat_…`, JWT-shaped strings, `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GITHUB_TOKEN`
  assignments.
- Private repos stay local in `cli` mode and are never sent to cloud providers unless the user
  chooses `api` or `hybrid` mode.

### Limitations

- The Proof Runner clones via HTTPS into `.skillproof/runs/<run_id>`. Make sure the directory is
  writable. Add `.skillproof/` to `.gitignore` (done by default).
- CLI flags for `claude` / `codex` change over time. If your CLI exits non-zero on `--version`,
  edit `skillproof.local.json` accordingly.
- The Ollama provider expects a JSON-capable model at `localhost:11434`. Pull one with
  `ollama pull llama3.1:8b`.
- Ownership verification via `gh` requires `gh auth login` and matches the authenticated user's
  login against the repo owner. A README mention of `skillproof:<your-username>` is treated as a
  repo-token signal.

---

## API routes

| Method | Path                          | Purpose                                              |
| ------ | ----------------------------- | ---------------------------------------------------- |
| POST   | `/api/analyze`                | Start a mission. Body: `repo_url`, `candidate_name`, `github_username?`, `target_role`, `candidate_level`, `job_description?`, `execution_mode?` (`api`/`cli`/`hybrid`/`mock`) |
| GET    | `/api/runs/[id]`              | Poll mission status. Returns scores, events, contract, coverage, authenticity, employer verifier, plan, terminal evidence, provider matrix, ownership status. |
| POST   | `/api/interview/evaluate`     | Score an interview answer; persists 5 dimension scores, recomputes overall, updates verification level. |
| POST   | `/api/challenge/evaluate`     | Score an AI Collaboration Challenge submission (`tool_used`, `proposed_diff`, `explanation`). |
| POST   | `/api/profile/publish`        | Create a public profile slug for a completed run.    |
| GET    | `/api/report/export?run_id=…` | Download the Markdown SkillProof Report.             |
| GET    | `/api/local/tools`            | Detect installed CLIs (git, gh, claude, codex, ollama, optional copilot). Returns versions, auth, capabilities, recommended mode. |
| POST   | `/api/local/command`          | Run a safe terminal command. Body: `command`, `args`, `cwd?`, `mission_id?`, `approved?`, `saveAsEvidence?`, `usedFor?`. Returns `403 approval_required` for gated commands. |
| GET    | `/api/local/providers?mode=…` | List provider availability + matrix for an execution mode. |
| POST   | `/api/local/providers`        | Save `skillproof.local.json` provider config.        |
| POST   | `/api/local/providers/test`   | Run a tiny JSON probe against a single provider. Body: `provider_id`, `prompt?`. Returns parsed JSON, raw output, model, token estimate, or error. |
| GET    | `/api/demo/seed`              | Fabricate a complete demo mission and return its profile URL. Sample data — clearly labeled. |

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
