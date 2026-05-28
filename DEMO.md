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

## Demo Flow

1. Sign in as `admin@skillproof.dev`.
2. Confirm provider health and agent configuration.
3. Sign in as `candidate@skillproof.dev`.
4. Start a verification from `/candidate/new-verification` using a real GitHub repo URL.
5. Watch the run page for provider readiness, agent progress, evidence locker, ownership state, terminal proof, score breakdown, and not-measured skills.
6. Complete the own-code interview.
7. Complete the AI-collaboration challenge.
8. Run allowlisted terminal commands from the run terminal and save existing command output as proof.
9. Publish the profile and choose whether terminal proof is included.
10. Sign in as `employer@skillproof.dev` and inspect search, candidate detail, compare, role fit, reports, and interview kit.
11. Sign in as `college@skillproof.dev` and inspect tenant dashboard, students, cohorts, skill gaps, placement readiness, reports, and employer-share links.
12. Sign in as `admin@skillproof.dev` and inspect run trace, evidence, provider matrix, provider health, agents, prompts, security, rubrics, and audit logs.

## Failure Demo

To show fail-closed behavior, disable or de-authenticate the configured provider and start a new run. The API should return `provider_not_ready` and no verification run should be created.

To show terminal safety, run a blocked command such as `node -e "console.log(process.env)"` from the candidate terminal. The API should return `blocked`, write an audit event, and not execute the command.
