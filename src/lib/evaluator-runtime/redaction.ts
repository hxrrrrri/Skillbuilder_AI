const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN (?:RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY-----[\s\S]*?-----END (?:RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY-----/g,
  /(["']?(?:api[_-]?key|token|secret|password|client[_-]?secret)["']?\s*[:=]\s*["'][^"']{8,}["'])/gi,
  /([A-Za-z0-9+/]{40,}={0,2})/g,
];

export function redactText(value: unknown, maxLength = 1200): string {
  let text = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[REDACTED_SECRET]");
  }
  text = text.replace(/([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY)[A-Z0-9_]*=)[^\s]+/gi, "$1[REDACTED_SECRET]");
  if (text.length > maxLength) {
    return `${text.slice(0, maxLength)}...[truncated ${text.length - maxLength} chars]`;
  }
  return text;
}

export function hasRedaction(value: unknown): boolean {
  const original = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  return redactText(value, Number.POSITIVE_INFINITY) !== original;
}

export function publicSafeEvidenceText(input: {
  claim: string;
  filePath?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  source?: string | null;
}): string {
  const location = input.filePath
    ? `${input.filePath}${input.lineStart ? `:${input.lineStart}${input.lineEnd && input.lineEnd !== input.lineStart ? `-${input.lineEnd}` : ""}` : ""}`
    : null;
  return redactText([location, input.source, input.claim].filter(Boolean).join(" - "), 500);
}
