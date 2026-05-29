# SkillProof AI Architecture

## Prototype Reliability Updates

- Provider/model defaults are centralized in `src/lib/providers/defaults.ts` and mirrored into DB registry rows by `npm run db:seed-registry -- --force`.
- Mission runs are processed by the web process only as a local fallback. Demo/production should set `SKILLPROOF_WORKER_MODE=1` and run `npm run demo:worker`.
- Worker claims use `in_progress`, `workerId`, `heartbeatAt`, `attemptCount`, `maxAttempts`, and `lastFailureReason` fields on `AnalysisRun`.
- `/demo/checklist` reports database, seeds, provider registry, prompts, provider health, worker mode, terminal proof, public reports, and GitHub token status.

SkillProof AI converts a real GitHub repository into hiring evidence through a validation-contract-first pipeline.

## Validation Contract First

The orchestrator runs before repo analysis and creates a validation contract: dimensions, assertions, weights, evidence requirements, and detectors. Later agents must support claims against this contract. The validator can lower, cap, flag, or mark not-measured; it must not raise scores.

## Mission Pipeline

Default demo/production flow is out-of-process:

1. Candidate starts `/candidate/new-verification`.
2. `/api/ownership/challenge` issues and persists a signed repo ownership challenge token.
3. `/api/analyze` validates repository URL, role input, ownership challenge linkage, and provider readiness.
4. A pending `AnalysisRun` and pending `AgentEvent` rows are created.
5. `npm run worker` claims one pending run at a time and executes the mission.
6. The candidate run page polls `/api/runs/[id]` and progressively renders contract, repo intelligence, timeline, evidence, skill graph, terminal proof, interview questions, and report preview.

Agent order:

`orchestrator -> repo-scanner -> architecture -> code-quality -> testing -> security -> ai-collaboration -> git-evidence -> documentation -> authenticity -> interview-gen -> answer-evaluator -> ai-collaboration-evaluator -> validator -> skill-graph -> employer-verifier -> improvement-plan -> profile-gen`

The seeded judge run follows the same persisted shape, but every seeded artifact is marked as demo data. Live runs regenerate provider outputs, repo intelligence, ownership status, terminal proof, interview results, and challenge scores.

## Provider Matrix

Providers are configured in `ProviderConfig` and `AgentConfig`. Mission start blocks required agents until the selected mode has passing provider health. Deterministic code is used for repo indexing, aggregation, and evidence processing only; it is not an LLM scoring fallback.

Supported providers: Anthropic API, Claude CLI, Codex CLI, Copilot CLI, Ollama, deterministic evidence utilities.

## Evidence Model

Evidence is stored across:

- `AgentEvent`: public-safe progress and structured handoffs.
- `SkillRun`: provider/model/runtime metadata and trace hashes.
- `SkillScore`: measured or not-measured skill score, source, confidence, validator notes, evidence JSON.
- `EvidenceFinding`: candidate/employer/public/admin-safe finding records.
- `TerminalCommandRun`: command, args, redacted summaries, output hash, duration, run scope.
- `OwnershipChallenge`: server-issued ownership challenge hash, repo/user binding, expiration, run linkage, and consumption timestamp.

Every measured public score must cite evidence. Missing evidence becomes `not_measured` or blocks public publishing.

## Repository Intelligence

The repo scanner builds a deterministic intelligence index before LLM scoring:

- file tree and language summary
- framework and package manager detection
- route/API/component/function/class/schema extraction
- test, CI, Docker, deployment, Prisma, auth/security-sensitive file signals
- dependency graph approximation
- risk flags and committed config warnings
- recent commit and contributor summaries
- script map for test/build/typecheck/lint proof

Candidate, employer, public, and admin surfaces render the index with role-appropriate filtering.

## Terminal Proof Safety

Terminal proof uses a run-scoped workspace under `.skillproof/runs/<run_id>`. Commands are allowlisted, destructive patterns and env dumps are blocked, installs require approval, outputs are redacted/truncated/hashed, and saving evidence marks an existing command run instead of rerunning it.

## Ownership Proof

Ownership proof prefers authenticated GitHub signals, then server-issued repo token proof, then self-declaration. Challenge tokens are signed, expire, and are stored only by hash. Local proof and remote verification scan `.skillproof-verify.json` and README for the token and compare hashes before marking ownership verified.

## Trust Surfaces

Candidate pages show full candidate-safe evidence. Employer pages show public-safe evidence only. College pages are tenant-scoped. Admin pages expose provider, agent, evidence, prompt, rubric, terminal, and audit details needed to inspect why a score exists.

`/demo` is the judge launcher. It links seeded role flows and the live verification path without treating seeded data as live verification.
