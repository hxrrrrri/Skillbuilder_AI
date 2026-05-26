// Rough token estimator. ~4 chars/token for English code+prose.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateBytesTokens(bytes: number): number {
  return Math.ceil(bytes / 4);
}

export type TokenLedger = {
  raw: number;
  used: number;
  savedPct: number;
};

export function buildLedger(raw: number, used: number): TokenLedger {
  const savedPct = raw > 0 ? Math.max(0, Math.min(100, (1 - used / raw) * 100)) : 0;
  return { raw, used, savedPct: Number(savedPct.toFixed(1)) };
}
