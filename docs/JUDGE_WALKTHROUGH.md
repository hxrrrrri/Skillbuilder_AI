# Judge Walkthrough

## Setup

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed-users
npm run db:seed-registry -- --force
npm run db:seed-prompts
```

Windows PowerShell worker demo:

```powershell
$env:SKILLPROOF_WORKER_MODE="1"; npm run dev
$env:SKILLPROOF_WORKER_MODE="1"; npm run worker
```

## Routes

- `/demo`: judge launcher and account shortcuts.
- `/demo/checklist`: setup, provider, worker, terminal, public gate, GitHub token, and command checklist.
- `/login`: seeded account sign-in.
- `/candidate/dashboard`: candidate overview.
- `/candidate/new-verification`: live GitHub repo verification wizard.
- `/candidate/runs/[id]`: live proof command center.
- `/candidate/interview/[runId]`: own-code interview flow.
- `/candidate/ai-challenge/[runId]`: AI-collaboration challenge.
- `/profile/casey-candidate-skillproof-ai-demo`: seeded private profile preview for authorized demo users.
- `/employer/search`: public-safe profile search and filters.
- `/employer/compare`: side-by-side comparison.
- `/employer/shortlist`: shortlist notes and candidate cards.
- `/college/dashboard`: tenant-scoped college readiness.
- `/college/cohorts`: cohort list.
- `/college/skill-gaps`: cohort skill gap heatmap/table.
- `/admin/dashboard`: platform control plane.
- `/admin/providers`: provider registry.
- `/admin/providers/health`: provider diagnostics and fix instructions.
- `/admin/agents`: agent/provider routing.
- `/admin/runs`: run observability.
- `/admin/evidence`: evidence records.
- `/admin/audit-logs`: audit trail.
- `/admin/prompts`: prompt versions.
- `/admin/rubrics`: rubric overview.
- `/admin/settings`: platform settings.

## What To Verify

- Seeded data is visibly labeled as demo data and cannot satisfy public/unlisted publish gates.
- Public trust badges appear only on profiles that pass gates.
- Missing dimensions show `not_measured`.
- Evidence items include source, confidence, file references, and validator notes where applicable.
- Public profile excludes private interview answers, raw prompts, raw model output, private terminal output, secrets, and admin traces.
- Provider readiness blocks mission start when required real providers fail.
- Terminal proof uses allowlisted commands, approval for install actions, redacted summaries, and output hashes.
- Download-execute pipes (`curl | sh`, `wget | sh`, `iwr | iex`), env dumps, `.env` reads, SSH/private key access, `node -e`, `node -p`, `python -c`, destructive commands, unknown commands, and unapproved installs/scripts are blocked.

## Updated Judge Proof Points

- The run timeline includes `employer-verifier` and `improvement-plan` as standalone stages before `profile-gen`.
- The AI-collaboration challenge creates execution proof from a submitted unified diff where possible.
- Failed or unavailable execution proof is visible as capped scoring and remaining-unverified text.
- The seeded profile is a private walkthrough artifact; publish it as private only. A live provider-backed run is required for public/unlisted visibility.

## Verification Commands

Run before presenting:

```bash
npm run typecheck
npm run test
npm run build
npm run e2e
```
