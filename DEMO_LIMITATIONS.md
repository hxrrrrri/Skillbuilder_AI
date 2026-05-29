# SkillProof AI Demo Limitations

- Seeded walkthrough data is private demo material. It cannot be published as verified public or unlisted evidence.
- Public verification requires real provider health checks and evidence-backed scores.
- Terminal proof uses a run-scoped local workspace, allowlist, blocklist, timeout, redaction, truncation, hashing, and audit logs. It is not full production sandbox isolation.
- Production terminal execution should remain disabled unless container isolation is added.
- GitHub API previews work unauthenticated but may hit low rate limits; set `GITHUB_TOKEN` for live demos.
- Provider availability depends on local CLI login, API keys, selected model availability, and JSON-only contract behavior.
## Current Prototype Boundaries

- Seeded data is marked `DEMO DATA — PRIVATE WALKTHROUGH ONLY` and is blocked from public/unlisted publishing.
- Live verification is provider-gated. Required LLM-reviewed stages do not run on deterministic fallback.
- AI-collaboration challenge proof applies unified diffs and runs safe npm checks when available. Non-JS repos or repos without executable checks are still accepted, but the AI Collaboration score is capped and marked partially unverified.
- Terminal proof is local policy-gated execution, not production container isolation. Keep production terminal execution disabled unless a hardened sandbox is deployed.
- `npm install` currently reports dependency audit findings; these require a separate dependency remediation pass.
