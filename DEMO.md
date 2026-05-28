# SkillProof AI Real-Provider Demo

This demo uses real providers and real evidence only.

## Prerequisites

```bash
npm install
npm run db:push
npm run db:seed-users
npm run db:seed-registry -- --force
npm run db:seed-prompts
```

Configure at least one real provider:

- Anthropic API: set `ANTHROPIC_API_KEY`
- Codex CLI: `npm install -g @openai/codex`, then run `codex` and sign in
- Claude CLI: install Claude Code, then `claude auth login`
- Copilot CLI: install the modern `copilot` binary and sign in
- Ollama: start Ollama and explicitly pull the configured model

Open `/admin/providers/health` and run provider tests until required agents have passing JSON contract results.

Seeded accounts:

- `candidate@skillproof.dev`
- `employer@skillproof.dev`
- `college@skillproof.dev`
- `admin@skillproof.dev`

Password for each seeded account: `demo1234`.

Recommended demo runtime:

```powershell
# terminal 1
$env:SKILLPROOF_WORKER_MODE="1"; npm run dev

# terminal 2
$env:SKILLPROOF_WORKER_MODE="1"; npm run worker
```

## 5-Minute Demo Flow

0:00 - Admin provider proof:

1. Sign in as `admin@skillproof.dev`.
2. Open `/admin/providers/health`.
3. Show required providers are enabled, authenticated, model-configured, and passing JSON contract tests.

0:45 - Candidate mission:

4. Sign in as `candidate@skillproof.dev`.
5. Open `/candidate/new-verification`.
6. Enter GitHub username, paste a real repo URL, and show the server-issued ownership challenge token.
7. Put the token in `.skillproof-verify.json` or README when demonstrating owner-level proof. Otherwise call out that ownership remains self-declared and low trust.
8. Select role, level, `Hybrid` or configured mode, and show provider readiness blockers/pass state.
9. Start the mission.

2:00 - Live proof command center:

10. Open the run detail page.
11. Show animated mission stages and section-level skeletons.
12. As data arrives, show validation contract, repo intelligence, agent timeline, evidence locker, skill graph, terminal proof state, interview questions, and report preview.

3:15 - Upgrade evidence:

13. Complete `/candidate/interview/[runId]` and show verification level becomes `repo_interview_verified`.
14. Complete `/candidate/ai-challenge/[runId]`.
15. If terminal proof is enabled, run an allowlisted command from `/candidate/runs/[id]/terminal` and save the existing output as evidence.

4:15 - Hiring surfaces:

16. Publish the profile only after gates pass; choose whether terminal proof is included.
17. Sign in as `employer@skillproof.dev` and show search, filters, detail, compare, report export, and interview kit.
18. Sign in as `college@skillproof.dev` and show cohorts, skill gaps, placement readiness, reports, and employer-share links.
19. Sign in as `admin@skillproof.dev` and show run trace, evidence, terminal commands, provider matrix, prompts, rubrics, and audit logs.

## Failure Demo

To show fail-closed behavior, disable or de-authenticate the configured provider and start a new run. The API should return `provider_not_ready` and no verification run should be created.

To show terminal safety, run a blocked command such as `node -e "console.log(process.env)"` from the candidate terminal. The API should return `blocked`, write an audit event, and not execute the command.
