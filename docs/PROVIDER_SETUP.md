# Provider Setup

SkillProof uses real providers for LLM scoring. Deterministic code is allowed for repo scanning, git evidence, validation support, and skill graph aggregation, but never as a silent LLM scoring fallback.

## Admin Flow

1. Run `npm run db:seed-registry -- --force`.
2. Open `/admin/providers`.
3. Configure provider model, command/base URL, enabled state, and notes.
4. Open `/admin/providers/health`.
5. Run health tests until required providers show installed/authenticated, JSON contract pass, non-interactive support, model selection support where applicable, and clear latency/error state.

## Required Providers

API mode requires a configured API provider for required LLM agents. CLI/local modes require installed and authenticated local providers. Hybrid mode can combine them, but required failed providers still block mission start.

`skip_optional` can skip optional agents only. Required scoring agents fail closed.

## Common Fixes

- `missing_binary`: install the CLI and verify its `--version` command.
- `provider_not_authenticated`: sign in or set the provider API key.
- `json_contract_failed`: use a JSON-capable model, lower temperature, or fix the prompt.
- `non_interactive_failed`: configure a provider that supports non-interactive CLI/API execution.
- `model_unavailable`: choose a model from the provider's available model list.
