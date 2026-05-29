# SkillProof AI Demo Limitations

- Seeded walkthrough data is private demo material. It cannot be published as verified public or unlisted evidence.
- Public verification requires real provider health checks and evidence-backed scores.
- Terminal proof uses a run-scoped local workspace, allowlist, blocklist, timeout, redaction, truncation, hashing, and audit logs. It is not full production sandbox isolation.
- Production terminal execution should remain disabled unless container isolation is added.
- GitHub API previews work unauthenticated but may hit low rate limits; set `GITHUB_TOKEN` for live demos.
- Provider availability depends on local CLI login, API keys, selected model availability, and JSON-only contract behavior.
