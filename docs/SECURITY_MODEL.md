# Security Model

## Terminal Proof

Terminal proof is run-scoped and policy-gated:

- authenticated owner/admin access required
- workspace restricted to `.skillproof/runs/<run_id>`
- command allowlist
- destructive commands blocked
- environment dumps blocked
- SSH/private-key and credential-store access blocked
- install commands require explicit approval
- stdout/stderr summarized, redacted, truncated, and hashed
- command runs are auditable

Saved terminal evidence marks an already executed command as evidence. It does not rerun arbitrary shell.

Terminal execution defaults disabled. Local demo can opt in with `SKILLPROOF_TERMINAL_ENABLED=1`; production should keep it disabled until container isolation is deployed.

## Public Data Boundary

Public profiles and reports exclude:

- raw prompts
- raw model outputs
- admin traces
- private terminal output
- secrets
- private interview answers
- unpublished/private data
- seeded demo walkthrough evidence

Employer views consume public-safe profile bundles. College views use tenant-scoped queries. Admin views expose full observability for platform operators.

## Publish Gates

Public and unlisted publishing requires completed, evidence-backed, provider-backed runs with validation summaries and ownership status. Profile visibility updates re-run the same gate, so unsafe private drafts cannot be promoted by patching visibility.

Seeded demo artifacts, mock/heuristic sources, missing evidence, private trace markers, and redaction hits block public/unlisted publishing.
## Challenge Workspace Safety

AI-collaboration execution uses the same safety posture as terminal proof: run-scoped workspaces, allowlisted commands, redacted/truncated output, output hashes, and persisted command records. The current prototype runs safe npm script checks when present. Production deployment should replace local execution with container isolation before enabling terminal execution for untrusted public traffic.
