"use client";

export function MockBanner({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
      <strong>Mock / Heuristic mode active.</strong> No Anthropic API key detected (or
      <code className="mx-1 font-mono">SKILLPROOF_MOCK_LLM=1</code>). Scores are deterministic heuristics with reduced confidence.
    </div>
  );
}
