# SkillProof AI Deployment

## Local Development

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run db:seed-users
npm run db:seed-registry -- --force
npm run db:seed-prompts
npm run dev
```

Seeded accounts use password `demo1234`.

## Worker Mode

Recommended demo/production mode:

```bash
SKILLPROOF_WORKER_MODE=1 npm run dev
SKILLPROOF_WORKER_MODE=1 npm run worker
```

With `SKILLPROOF_WORKER_MODE=1`, `/api/analyze` queues pending runs and the worker claims them out-of-process. Without it in local development, the API uses an in-process fallback and the run page shows a visible banner.

PowerShell:

```powershell
# terminal 1
$env:SKILLPROOF_WORKER_MODE="1"; npm run dev

# terminal 2
$env:SKILLPROOF_WORKER_MODE="1"; npm run worker
```

## Provider Setup

Run:

```bash
npm run db:seed-registry -- --force
```

Then open `/admin/providers/health`, configure provider credentials/commands, and run health tests until required providers pass JSON contract checks.

Environment variables commonly used:

- `ANTHROPIC_API_KEY`
- `GITHUB_TOKEN`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `DATABASE_URL`
- `SKILLPROOF_WORKER_MODE=1`
- `SKILLPROOF_TERMINAL_ENABLED=1`
- `SKILLPROOF_PUBLIC_REPORTS_ENABLED=0`
- `SKILLPROOF_OWNERSHIP_SECRET`

## Ownership Challenge Setup

Set `NEXTAUTH_SECRET` in all environments. Optionally set `SKILLPROOF_OWNERSHIP_SECRET` to rotate ownership-token signing separately. Ownership challenge tokens expire, are stored by hash, and are linked to an `AnalysisRun` when `/api/analyze` starts.

## Sandbox Guidance

Current local demo execution uses the `local_process` sandbox abstraction: run-scoped workspace, allowlist, timeout, truncation, secret redaction, and audit logs. Production should move the same interface behind Docker or isolated workers before enabling terminal execution. Do not mount SSH directories, private keys, global credential stores, or broad network access into the proof workspace.

## Production Warnings

Do not enable terminal execution in production without a sandboxed host policy. Prefer Docker or isolated workers, scoped network access, short timeouts, output truncation, secret redaction, and audit retention. Do not seed demo users in a real tenant. Do not configure deterministic provider as a scoring provider.
