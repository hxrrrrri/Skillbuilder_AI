// Token/secret redaction. Used before persisting or showing terminal output.

const PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /sk-ant-[A-Za-z0-9_\-]{20,}/g, label: "[REDACTED_ANTHROPIC_KEY]" },
  { re: /sk-[A-Za-z0-9]{20,}/g, label: "[REDACTED_OPENAI_KEY]" },
  { re: /ghp_[A-Za-z0-9]{20,}/g, label: "[REDACTED_GITHUB_PAT]" },
  { re: /github_pat_[A-Za-z0-9_]{20,}/g, label: "[REDACTED_GITHUB_PAT]" },
  { re: /gho_[A-Za-z0-9]{20,}/g, label: "[REDACTED_GITHUB_OAUTH]" },
  { re: /xox[baprs]-[A-Za-z0-9-]{10,}/g, label: "[REDACTED_SLACK_TOKEN]" },
  { re: /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, label: "[REDACTED_JWT]" },
  { re: /\b(ANTHROPIC_API_KEY|OPENAI_API_KEY|GITHUB_TOKEN)\s*=\s*\S+/gi, label: "$1=[REDACTED]" },
  { re: /AKIA[0-9A-Z]{16}/g, label: "[REDACTED_AWS_KEY]" },
];

export function redact(input: string): string {
  if (!input) return input;
  let out = input;
  for (const p of PATTERNS) out = out.replace(p.re, p.label);
  return out;
}

export function redactObject<T>(obj: T): T {
  if (typeof obj === "string") return redact(obj) as unknown as T;
  if (Array.isArray(obj)) return obj.map(redactObject) as unknown as T;
  if (obj && typeof obj === "object") {
    const o: any = {};
    for (const [k, v] of Object.entries(obj as any)) o[k] = redactObject(v as any);
    return o;
  }
  return obj;
}
