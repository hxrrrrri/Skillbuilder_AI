# SkillProof AI Demo (Real Provider)

This demo path uses real providers and real evidence only. For a private UI walkthrough without a real provider, run `npm run setup:demo` and open `/demo/checklist`. Seeded walkthrough scores are private demo artifacts and cannot be published as verified public evidence.

## Certification Commands (Run in Order)

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed-users
npm run db:seed-registry -- --force
npm run db:seed-prompts
npm run typecheck
npm run test
npm run build
```

Shortcut for local setup:

```bash
npm run setup:demo
```

## Seeded Users

- candidate@skillproof.dev
- employer@skillproof.dev
- college@skillproof.dev
- admin@skillproof.dev

Password for every seeded account: demo1234

## Provider Setup Check

Configure at least one real provider:

- Anthropic API: set ANTHROPIC_API_KEY
- Codex CLI: npm install -g @openai/codex, then run codex and sign in
- Claude CLI: install Claude Code, then claude auth login
- Copilot CLI: install the modern copilot binary and sign in
- Ollama: start Ollama and explicitly pull the configured model

Then validate readiness:

1. Sign in as admin@skillproof.dev.
2. Open /admin/providers/health.
3. Run provider tests until required agents show ready and JSON contract ok.
4. Open /demo/checklist and confirm Real provider health is ready.
5. Confirm /api/providers/readiness?mode=hybrid returns ok=true.

## Runtime (Worker Mode)

```powershell
# terminal 1
$env:SKILLPROOF_WORKER_MODE="1"; npm run dev

# terminal 2
$env:SKILLPROOF_WORKER_MODE="1"; npm run worker
```

## Candidate Demo Flow

1. Sign in as candidate@skillproof.dev.
2. Open /candidate/new-verification.
3. Enter GitHub username and repo URL, then show the repo preview card.
4. Issue the server ownership token and show placement in README or .skillproof-verify.json.
5. Select role and level; ensure provider readiness shows ok (fix blockers if not).
6. Start the mission and note the created run id.
7. Open /candidate/runs/[id] to show worker processing, polling, and section loaders.
8. Watch the agent timeline update without refreshing.
9. Confirm ownership status and terminal proof state are clear (skipped vs. passed).
10. Complete /candidate/interview/[runId] and /candidate/ai-challenge/[runId].
11. Return to the command center to show evidence-backed report sections.
12. Publish the profile only after gates pass; show private draft allowed when public trust gates fail.

## Employer Demo Flow

1. Sign in as employer@skillproof.dev.
2. Open a published real-provider profile at /profile/[slug].
3. Open the report or export from the profile view.
4. Show interview kit and compare if needed.

## Fallback Plan if Provider Health Fails

- Show fail-closed behavior: provider_not_ready from /api/analyze and readiness blockers in the wizard.
- Fix: re-auth the provider, re-run /admin/providers/health tests, or switch to a configured local provider and set execution mode to local or hybrid.
- If still blocked, do not publish public/unlisted profiles; only show private drafts after readiness passes.
