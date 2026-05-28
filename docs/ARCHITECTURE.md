# SkillProof AI Architecture

SkillProof AI converts a real GitHub repository into hiring evidence through a validation-contract-first pipeline.

## Validation Contract First

The orchestrator runs before repo analysis and creates a validation contract: dimensions, assertions, weights, evidence requirements, and detectors. Later agents must support claims against this contract. The validator can lower, cap, flag, or mark not-measured; it must not raise scores.

## Mission Pipeline

Default demo/production flow is out-of-process:

1. Candidate starts `/candidate/new-verification`.
2. `/api/analyze` validates repository URL, role input, ownership declarations, and provider readiness.
3. A pending `AnalysisRun` and pending `AgentEvent` rows are created.
4. `npm run worker` claims one pending run at a time and executes the mission.
5. The candidate run page polls `/api/runs/[id]` and progressively renders contract, repo intelligence, timeline, evidence, skill graph, terminal proof, interview questions, and report preview.

Agent order:

`orchestrator -> repo-scanner -> architecture -> code-quality -> testing -> security -> ai-collaboration -> git-evidence -> documentation -> authenticity -> interview-gen -> validator -> skill-graph -> profile-gen`

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

Every measured public score must cite evidence. Missing evidence becomes `not_measured` or blocks public publishing.

## Terminal Proof Safety

Terminal proof uses a run-scoped workspace under `.skillproof/runs/<run_id>`. Commands are allowlisted, destructive patterns and env dumps are blocked, installs require approval, outputs are redacted/truncated/hashed, and saving evidence marks an existing command run instead of rerunning it.

## Trust Surfaces

Candidate pages show full candidate-safe evidence. Employer pages show public-safe evidence only. College pages are tenant-scoped. Admin pages expose provider, agent, evidence, prompt, rubric, terminal, and audit details needed to inspect why a score exists.
