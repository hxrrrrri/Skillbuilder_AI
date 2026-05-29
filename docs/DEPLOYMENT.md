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

For certified local setup, run `npm run setup:demo` and review `/demo/checklist`.

CI and release certification run:

```bash
npm install
npm run db:generate
npm run typecheck
npm run test
npm run build
```

## Database: SQLite (dev) → Postgres (prod)

Development stays on SQLite — `DATABASE_URL="file:./dev.db"` with `prisma/schema.prisma`. Nothing about the dev flow changes.

Production should use Postgres. SQLite serializes writes, so a concurrent web process + out-of-process worker hit `SQLITE_BUSY: database is locked`. Postgres handles the concurrent writers. A second schema, `prisma/schema.postgres.prisma`, is kept byte-for-byte in sync with the SQLite schema except for `provider = "postgresql"`.

Postgres provisioning steps (greenfield — no data is migrated):

```bash
# 1. Point at your managed Postgres instance.
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/skillproof?schema=public&sslmode=require"

# 2. (Optional) static sanity check of the Postgres schema.
npm run db:validate:postgres

# 3. Generate the Prisma client against the Postgres schema.
#    Run this AFTER `npm install` — `postinstall` generates the SQLite client by
#    default, so the Postgres generate must come last in the deploy build step.
npm run db:generate:postgres

# 4. Create the tables.
npm run db:push:postgres

# 5. (Optional) seed registry/users/prompts — writes through the client generated in step 3.
npm run db:seed-users
npm run db:seed-registry -- --force
npm run db:seed-prompts

# 6. Build and run.
npm run build
SKILLPROOF_WORKER_MODE=1 npm run start   # web
SKILLPROOF_WORKER_MODE=1 npm run worker  # worker (separate process)
```

PowerShell equivalents for steps 1–4:

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/skillproof?schema=public&sslmode=require"
npm run db:validate:postgres
npm run db:generate:postgres
npm run db:push:postgres
```

Notes:

- The SQLite schema (`prisma/schema.prisma`) and `prisma/dev.db` stay in the repo. Do not delete them; dev depends on them.
- After editing models, change `prisma/schema.prisma` and copy the changes into `prisma/schema.postgres.prisma` (only the `provider` line should differ). `npm run db:validate:postgres` catches drift.
- A managed Postgres + a shared rate-limit/log store (see below) is the path to running more than one web replica.

## Operational Environment

- Rate limiting (in-memory token bucket; per-route burst then linear refill). Defaults are sane; override per route via `RATE_LIMIT_<ROUTE>_MAX` and `RATE_LIMIT_<ROUTE>_WINDOW_MS` where `<ROUTE>` is `ANALYZE` (default 5 / 5 min), `REGISTER` (10 / 1 h, IP-keyed), `INTERVIEW` (30 / 5 min), `CHALLENGE` (15 / 5 min). Set `RATE_LIMIT_DISABLED=1` to turn limiting off. Buckets are per-process — move to Redis before scaling web replicas horizontally.
- Logging: `LOG_LEVEL` (`debug|info|warn|error`; defaults `info` in production, `debug` otherwise) and `LOG_FORMAT` (`json|pretty`; defaults `json` in production, `pretty` otherwise).

## Worker Mode

Recommended demo/production mode:

```bash
SKILLPROOF_WORKER_MODE=1 npm run dev
SKILLPROOF_WORKER_MODE=1 npm run worker
```

With `SKILLPROOF_WORKER_MODE=1`, `/api/analyze` queues pending runs and the worker claims them out-of-process. Claims record `workerId`, heartbeat, attempts, max attempts, and last failure reason. Without worker mode in local development, the API uses an in-process fallback and the run page shows a visible banner.

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
