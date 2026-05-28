# SkillProof AI Trust Model

SkillProof AI is designed to avoid fake verification. A score is publishable only when it has a real source and evidence.

## Score Sources

Allowed sources:

- `llm`: real provider JSON output backed by selected repo context.
- `terminal`: allowlisted command proof with redacted output hash.
- `github_api`: deterministic GitHub repository evidence.
- `local_clone`: deterministic local clone evidence.
- `interview`: evaluated own-code interview answer.
- `challenge`: evaluated AI-collaboration challenge.
- `deterministic`: evidence aggregation or skill graph computation, not LLM scoring.
- `not_measured`: explicit absence of enough evidence.

Blocked public sources:

- `mock`
- `heuristic`

## Ownership Levels

- `verified owner`: OAuth/app/gh owner match.
- `verified collaborator`: authenticated collaborator signal.
- `repo token verified`: SkillProof token found in `.skillproof-verify.json` or README.
- `self-declared`: user supplied a GitHub username, but no stronger signal exists.
- `unverified`: no usable ownership signal.

Repo token proof uses `/api/ownership/challenge`. The server signs a token tied to user ID, repo owner/name, challenge ID, and expiration. The database stores only the token hash. Verification scans README and `.skillproof-verify.json`, extracts SkillProof challenge tokens, hashes them, and compares against the stored challenge.

Self-declared ownership caps trust badges and employer recommendations.

## Public Publishing Gates

Public and unlisted profiles require:

- completed run
- non-mock execution mode
- no `mock` or `heuristic` score source
- every measured skill has evidence
- provider matrix stored
- validation summary stored
- profile summary stored
- employer verifier stored
- ownership status stored
- public report redaction passes
- candidate-selected visibility
- explicit control over terminal proof inclusion

Trust tiers visible on candidate and public profile surfaces:

- Published Profile
- Evidence-Backed Profile
- Owner Verified Profile
- Repo + Interview Verified Profile
- Terminal Proof Included
- Challenge Verified

The fully verified badge additionally requires verified ownership, completed repo analysis, validator completion, evaluated interview evidence, no unsafe score source, no high-risk security signal, and evidence-backed measured scores.

If gates fail, only a private draft profile is allowed.

## Redaction

Public-safe reports never expose raw prompts, raw model output, private terminal output, private interview answers, secrets, admin traces, unpublished profiles, or private candidate data.

## Not Measured

Missing terminal proof, skipped providers, missing interview answers, or insufficient AI-collaboration evidence do not become passing scores. They stay `not_measured` and are excluded from the denominator.
