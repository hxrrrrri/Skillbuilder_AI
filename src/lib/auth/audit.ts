import { prisma } from "@/lib/db";

export type AuditEntry = {
  action: string;
  actorUserId?: string | null;
  tenantId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

const REDACT_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "secret",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
]);

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > 500) return value.slice(0, 500) + "...[truncated]";
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEYS.has(k.toLowerCase())) {
        out[k] = "[redacted]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const metadata = entry.metadata ? JSON.stringify(redact(entry.metadata)) : null;
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        tenantId: entry.tenantId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write", entry.action, err);
  }
}
