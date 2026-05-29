// Secret redaction for everything the copilot is allowed to see or say.
//
// The assistant's context is assembled from DB rows, provider configs, audit
// logs, and retrieved docs. None of that is allowed to leak raw secrets, env
// values, API keys, or tokens — to the model, to the transcript, or to a public
// surface. This module is the choke point; context.ts and the read tools pipe
// their output through `redactDeep` before it reaches a prompt or a response.

const SECRET_KEY_PATTERN =
  /(pass(word)?|passwordhash|secret|token|api[_-]?key|apikey|authorization|auth[_-]?token|cookie|private[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|session[_-]?token|bearer|credential)/i;

// Standalone secret-shaped strings (keys/tokens). Conservative so we don't nuke
// ordinary prose, but broad enough to catch the common provider key formats.
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g, // Anthropic
  /sk-[A-Za-z0-9]{20,}/g, // OpenAI-style
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /xox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /AIza[0-9A-Za-z_-]{30,}/g, // Google
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export const REDACTED = "[redacted]";

/** Returns true when the key name looks like it holds a secret. */
export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

/**
 * Redact secret-shaped substrings inside a free-text string. Also masks any
 * literal value currently present in the process environment (so a leaked
 * ANTHROPIC_API_KEY in a log line is scrubbed even if it doesn't match a
 * known prefix). Env names themselves are kept — only their values are masked.
 */
export function redactText(input: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = input;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  for (const value of Object.values(env)) {
    if (typeof value === "string" && value.length >= 8 && /[A-Za-z0-9_\-]/.test(value)) {
      // Only mask values that look like secrets, not e.g. "development".
      if (/[-_]/.test(value) || value.length >= 20) {
        out = out.split(value).join(REDACTED);
      }
    }
  }
  return out;
}

/**
 * Deep-redact an arbitrary value: secret-named keys are replaced wholesale, and
 * every string leaf is scrubbed for secret-shaped substrings. Used on anything
 * derived from the database or environment before it enters a prompt/response.
 */
export function redactDeep<T>(value: T, env: NodeJS.ProcessEnv = process.env): T {
  return redactInner(value, env) as T;
}

function redactInner(value: unknown, env: NodeJS.ProcessEnv): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value, env);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => redactInner(v, env));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSecretKey(k) ? REDACTED : redactInner(v, env);
    }
    return out;
  }
  return value;
}
