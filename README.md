# SkillProof AI

Proof-of-work hiring for AI-native developers. Paste a GitHub repo, watch an agent mission verify real skill, get a public credibility profile employers can trust.

> Replace "trust my resume" with "verify my work."

## What it does

1. You paste a public GitHub repo URL + target role.
2. The **Orchestrator** writes a **validation contract** (defines "good" upfront).
3. Specialist worker agents analyze the repo serially with structured handoffs:
   Repo Scanner → Architecture → Code Quality → Testing → Security → Git Evidence → Interview Generator → Skill Graph → Profile.
4. A **Validator agent** with fresh context audits every score for supporting evidence and removes hallucinations.
5. You get a skill graph, evidence-backed scoring, code-based mock interview, and a shareable public profile.

## Architecture — "Missions"

Inspired by Factory's Missions architecture (Luke Burke, AI Agent Builder Day):

| Concept | SkillProof Implementation |
| --- | --- |
| Orchestrator | `src/agents/orchestrator.ts` — produces evaluation plan + validation contract |
| Workers | `src/agents/{architecture,code-quality,testing,security,git-evidence,interview-gen}.ts` — clean context per feature |
| Validators | `src/agents/validator.ts` + `src/agents/answer-evaluator.ts` — fresh context, adversarial by design |
| Validation contract | Written before any analysis — defines correctness independently of implementation |
| Structured handoffs | `Handoff` type in `src/agents/types.ts` — completed/unresolved/evidence/commands |
| Serial execution | `src/agents/mission-runner.ts` — one worker at a time, read-only ops parallelized |
| Mission control | `src/app/mission/[id]/page.tsx` — live agent cards + token meter |
| Droid whispering | Per-role model override via env (`MODEL_ORCHESTRATOR`, `MODEL_WORKER`, `MODEL_VALIDATOR`) |

## Token efficiency

We never send the full repo. The Repo Scanner does deterministic, non-LLM analysis via the GitHub REST API and produces a small context pack: README, package/config files, folder tree, test file list, CI config, top 3–5 representative source files. The UI surfaces "tokens saved" so judges can see it.

## Tech stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (dark, premium feel)
- Recharts (skill radar)
- Anthropic Claude SDK (Opus for planning/validation, Sonnet for workers)
- Prisma + SQLite (zero-setup local DB)
- GitHub REST API (no clone needed)

## Quick start

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY

# 3. Init local SQLite db
npm run db:push

# 4. Run dev server
npm run dev
# open http://localhost:3000
```

## Demo flow

1. Landing — paste a public GitHub repo URL.
2. Mission Control — watch 9 agent cards light up in order. See token saved meter.
3. Skill Graph — radar chart with evidence-backed scoring.
4. Evidence Panel — every score backed by file references.
5. Interview — answer a question generated from your own code.
6. Public Profile — shareable verified credibility page.

## Project structure

```
src/
  app/
    page.tsx                      landing
    mission/[id]/page.tsx         live mission control
    profile/[slug]/page.tsx       public verified profile
    api/                          REST endpoints
  agents/
    types.ts                      Handoff, ValidationContract, AgentOutput
    mission-runner.ts             serial executor with handoffs
    orchestrator.ts               Agent 1
    repo-scanner.ts               Agent 2 (deterministic, no LLM)
    architecture.ts               Agent 3
    code-quality.ts               Agent 4
    testing.ts                    Agent 5
    security.ts                   Agent 6
    git-evidence.ts               Agent 7
    interview-gen.ts              Agent 8
    answer-evaluator.ts           Agent 9
    validator.ts                  Agent 10 (creator–verifier separation)
    skill-graph.ts                Agent 11
    profile-gen.ts                Agent 12
  lib/
    github.ts                     selective REST fetch
    claude.ts                     Anthropic SDK wrapper + model router
    db.ts                         Prisma client
    token-meter.ts                raw vs analyzed token counter
  components/                     UI primitives + mission control widgets
prisma/
  schema.prisma                   SQLite schema
```

## Monetization

- **Free** — 1 public verified profile
- **Student Pro** — ₹299/mo: unlimited analyses, growth tracking, re-verification
- **College / Bootcamp SaaS** — placement dashboard, bulk student ranking, recruiter export
- **Recruiter API** — pay-per-verified-shortlist, ATS integration (Greenhouse / Lever / Workday)
- **Verified Badge Embed** — cryptographic signature on LinkedIn / portfolio sites

## Status

MVP scaffold. Repo Scanner does real GitHub API fetch; other agents return structured outputs via the Claude SDK or deterministic stubs when `SKILLPROOF_MOCK_LLM=1`. Validator audits every claim against evidence.
