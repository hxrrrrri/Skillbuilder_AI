# SkillProof AI Security

SkillProof AI fails closed for verification. Public or employer-visible scores require real provider output, GitHub/API evidence, local clone evidence, terminal proof, interview evaluation, challenge evaluation, or deterministic aggregation from already collected evidence.

## RBAC

- Candidates mutate only their own runs and profiles.
- Employers consume public/shared profiles only.
- College users read tenant-scoped student/cohort/readiness data only.
- Admins can inspect providers, prompts, runs, evidence, audit logs, and failures.
- Anonymous users cannot mutate proof.

## Public Surface Redaction

Public profiles and reports must not expose raw prompts, raw model output, raw context packs, admin traces, private interview answers, private terminal output, secrets, or unpublished private data. Publish gates block seeded demo data, mock or heuristic score sources, missing evidence, private trace markers, and secret-like payloads.

## Terminal Proof

Terminal proof is disabled by default. Local demo can enable it with `SKILLPROOF_TERMINAL_ENABLED=1`; production should not enable it without container isolation. Commands are run-scoped to `.skillproof/runs/<run_id>`, allowlisted, redacted, timed out, truncated, hashed, and audited.

Hard blocks include destructive commands, env dumps, `.env` reads, SSH/private key access, `curl | sh`, `wget | sh`, `iwr | iex`, interpreter eval flags (`node -e`, `node -p`, `python -c`), unknown commands, and arbitrary shell execution. Installs and package scripts require explicit approval and still run through the same policy.

## Ownership Proof

Ownership priority is GitHub owner match, collaborator permission, server-issued repository challenge token, self-declared username, then unverified. Server-issued tokens are signed, scoped to user/repo/challenge, expiring, and stored only as hashes.

Public payloads that imply verified ownership are blocked when the stored ownership status is only self-declared or unverified.
