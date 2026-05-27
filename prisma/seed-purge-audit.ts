/**
 * Audit log retention. Deletes AuditLog rows older than RETENTION_DAYS (default 90).
 *
 * Usage:
 *   npm run db:purge-audit                  # 90-day cutoff
 *   AUDIT_RETENTION_DAYS=30 npm run db:purge-audit
 *   npm run db:purge-audit -- --dry-run
 *
 * Schedule via cron or a recurring job runner.
 */
import { computeCutoff, DEFAULT_AUDIT_RETENTION_DAYS } from "../src/lib/audit-retention";

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const days = Number.parseInt(
      process.env.AUDIT_RETENTION_DAYS ?? `${DEFAULT_AUDIT_RETENTION_DAYS}`,
      10,
    );
    if (!Number.isFinite(days) || days < 1) {
      throw new Error(`invalid AUDIT_RETENTION_DAYS=${process.env.AUDIT_RETENTION_DAYS}`);
    }

    const dryRun = process.argv.includes("--dry-run");
    const cutoff = computeCutoff(days);
    const total = await prisma.auditLog.count();
    const toPurge = await prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } });

    console.log(
      `[purge-audit] retention=${days}d cutoff=${cutoff.toISOString()} total=${total} purge=${toPurge}${dryRun ? " (dry-run)" : ""}`,
    );
    if (dryRun) return;

    const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    console.log(`[purge-audit] deleted=${result.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[purge-audit] failed", err);
    process.exit(1);
  });
}
