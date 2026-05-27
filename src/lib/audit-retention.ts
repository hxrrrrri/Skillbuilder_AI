export const DEFAULT_AUDIT_RETENTION_DAYS = 90;

export function computeCutoff(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
