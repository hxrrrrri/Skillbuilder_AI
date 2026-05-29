// Risk model for SkillProof Command Copilot tools.
//
// Every tool in the registry carries a RiskLevel. The level decides whether the
// assistant may execute it immediately or must first produce a plan and obtain
// explicit admin approval. The ordering below is the single source of truth used
// by the engine, the routes, and the UI badges.

export const RISK_LEVELS = ["read", "write_safe", "write_sensitive", "destructive", "forbidden"] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

export function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === "string" && (RISK_LEVELS as readonly string[]).includes(value);
}

/**
 * read              → execute immediately, no confirmation.
 * write_safe        → confirmation required (plan shown).
 * write_sensitive   → confirmation required WITH an explicit before/after diff.
 * destructive       → strong confirmation required (typed confirmation phrase).
 * forbidden         → never executes under any circumstances.
 */
export function requiresApproval(risk: RiskLevel): boolean {
  return risk === "write_safe" || risk === "write_sensitive" || risk === "destructive";
}

export function requiresDiffPreview(risk: RiskLevel): boolean {
  return risk === "write_sensitive" || risk === "destructive";
}

export function requiresTypedConfirmation(risk: RiskLevel): boolean {
  return risk === "destructive";
}

export function isExecutable(risk: RiskLevel): boolean {
  return risk !== "forbidden";
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  read: "Read",
  write_safe: "Write · safe",
  write_sensitive: "Write · sensitive",
  destructive: "Destructive",
  forbidden: "Forbidden",
};

/** Confirmation phrase a destructive action requires the admin to type verbatim. */
export function confirmationPhraseFor(toolName: string): string {
  return `CONFIRM ${toolName}`;
}
