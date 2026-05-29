# SkillProof AI Audit Fixed

## What Was Fixed

- Seeded judge walkthrough data is now private demo material, not public verification. Seeded demo artifacts are blocked from public/unlisted publish gates.
- Provider/model defaults are centralized in `src/lib/providers/defaults.ts`; Ollama defaults now match the catalog.
- Deterministic provider is guarded so it cannot be assigned to LLM scoring agents.
- Added `npm run setup:demo`, `npm run demo`, `npm run demo:worker`, and `/demo/checklist`.
- Worker processing now records `in_progress` claims, worker ID, heartbeat timestamp, attempts, max attempts, stuck-run recovery, graceful shutdown, and failure reason.
- Legacy self-generated ownership-token fallback was removed. Repository token verification now requires server-issued signed challenge token hashes.
- Terminal proof defaults disabled in `.env.example`; local demo opt-in is documented.
- Public publish gates now block seeded demo data, mock/heuristic sources, missing evidence, private trace markers, redaction hits, and missing public-safe artifacts.
- CI now uses `npm install` followed by `npm run db:generate`, `npm run typecheck`, `npm run test`, and `npm run build`.

## What Was Added

- `/demo/checklist` certified setup page.
- `src/lib/demo-checklist.ts` and tests.
- Provider defaults module and provider consistency tests.
- Worker claim/retry/failure tests.
- Public publish gate tests for seeded demo and private trace markers.
- `docs/SECURITY.md`, `docs/HACKATHON_DEMO_SCRIPT.md`, and `DEMO_LIMITATIONS.md`.

## Commands Run And Results

- `npm install` -> passed. Prisma client generated. npm reported 12 dependency audit findings: 8 moderate, 3 high, 1 critical.
- `npm run db:generate` -> passed.
- `npm run db:push` -> passed. SQLite database synchronized and Prisma client regenerated.
- `npm run db:seed-users` -> passed. Seeded candidate, employer, college, admin, and private demo run/profile.
- `npm run db:seed-registry -- --force` -> passed. Providers updated: 6. Agents updated: 18. Evaluator skills updated: 12.
- `npm run db:seed-prompts` -> passed. Prompt seed complete: created=0, updated=0, skipped=18.
- `npm run typecheck` -> passed.
- `npm run test` -> passed. 54 test files, 269 tests.
- `npm run build` -> passed. Next.js built 53 app routes. One existing lint warning remains for `<img>` usage in `src/app/page.tsx`.

## Remaining Limitations

- Real public verification still requires a real provider to pass health checks and JSON contract tests.
- Seeded walkthrough data remains private and cannot prove public candidate skill.
- Terminal proof is local policy-gated execution, not production container isolation. Keep disabled in production until isolation is added.
- GitHub preview/rate limits depend on `GITHUB_TOKEN`.
- Dependency audit findings from `npm install` remain to be triaged separately.

## Demo Path

1. Run `npm run setup:demo`.
2. Run `npm run demo`.
3. Open `/demo/checklist`.
4. Sign in with seeded accounts using `demo1234`.
5. Configure and test a real provider in `/admin/providers/health`.
6. Start a live verification from `/candidate/new-verification`.
7. Publish public/unlisted profiles only after trust gates pass.
