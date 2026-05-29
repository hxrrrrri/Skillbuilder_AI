# SkillProof AI Hackathon Demo Script

## Setup

```bash
npm install
npm run setup:demo
npm run typecheck
npm run test
npm run build
npm run demo
```

For worker mode, run this in a second terminal:

```bash
npm run demo:worker
```

Use `/demo/checklist` before judging. Any blocked item includes the next action.

## Walkthrough

1. Open `/demo` and explain: SkillProof AI verifies real developer skill from repository evidence, provider-backed analysis, ownership proof, terminal proof, own-code interviews, and AI-collaboration challenges.
2. Open `/demo/checklist` to show readiness and fail-closed provider status.
3. Sign in as `candidate@skillproof.dev` with `demo1234`; inspect the private seeded run as walkthrough data.
4. Start a live run from `/candidate/new-verification`; if providers are not ready, show the blocker.
5. Show ownership challenge placement in README or `.skillproof-verify.json`.
6. Open the run command center and show provider matrix, agent timeline, repo intelligence, evidence locker, terminal proof, interview, challenge, and publish gates.
7. Sign in as employer and show only public/shared evidence-backed profiles.
8. Sign in as college and show tenant-scoped cohorts, readiness, skill gaps, reports, and share links.
9. Sign in as admin and show providers, prompts, runs, evidence, audit logs, terminal commands, and publish blockers.

## Demo Accounts

- `candidate@skillproof.dev`
- `employer@skillproof.dev`
- `college@skillproof.dev`
- `admin@skillproof.dev`

Password: `demo1234`
