# Judge Walkthrough

## Routes

- `/demo`: judge launcher and account shortcuts.
- `/candidate/dashboard`: candidate overview.
- `/candidate/new-verification`: live GitHub repo verification wizard.
- `/candidate/runs/[id]`: live proof command center.
- `/candidate/interview/[runId]`: own-code interview flow.
- `/candidate/ai-challenge/[runId]`: AI-collaboration challenge.
- `/profile/casey-candidate-skillproof-ai-demo`: seeded public profile.
- `/employer/search`: public profile search and filters.
- `/employer/compare`: side-by-side comparison.
- `/college/dashboard`: tenant-scoped college readiness.
- `/admin/providers/health`: provider diagnostics and fix instructions.
- `/admin/runs`: run observability.
- `/admin/evidence`: evidence records.

## What To Verify

- Seeded data is visibly labeled as demo data.
- Public trust badges appear only on profiles that pass gates.
- Missing dimensions show `not_measured`.
- Evidence items include source, confidence, file references, and validator notes where applicable.
- Public profile excludes private interview answers, raw prompts, raw model output, private terminal output, secrets, and admin traces.
- Provider readiness blocks mission start when required real providers fail.
- Terminal proof uses allowlisted commands, approval for install actions, redacted summaries, and output hashes.
