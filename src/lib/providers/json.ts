export function parseJsonStrict<T = any>(text: string): T | null {
  const body = text.trim();
  if (!body) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

export function parseMarkedJson<T = any>(text: string): T | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) {
    const parsed = parseJsonStrict<T>(fenced[1]);
    if (parsed !== null) return parsed;
  }
  const marked = text.match(/<json>\s*([\s\S]*?)\s*<\/json>/i);
  if (marked) {
    const parsed = parseJsonStrict<T>(marked[1]);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function parseJsonFromText<T = any>(text: string): T | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  const sub = text.slice(start);
  try {
    return JSON.parse(sub) as T;
  } catch {}
  const last = Math.max(sub.lastIndexOf("}"), sub.lastIndexOf("]"));
  if (last === -1) return null;
  try {
    return JSON.parse(sub.slice(0, last + 1)) as T;
  } catch {
    return null;
  }
}

export function parseProviderJson<T = any>(stdout: string, rawFallback?: string): T | null {
  return (
    parseJsonStrict<T>(stdout) ??
    parseMarkedJson<T>(stdout) ??
    parseMarkedJson<T>(rawFallback ?? "") ??
    parseJsonFromText<T>(stdout) ??
    parseJsonFromText<T>(rawFallback ?? "")
  );
}

export function jsonRepairPrompt(originalPrompt: string, schemaHint: string, invalidOutput: string): string {
  return `${originalPrompt}

The previous response was invalid for SkillProof's JSON contract.
Return JSON only. No markdown. No prose. No tool calls.
Required shape: ${schemaHint}

Invalid output preview:
${invalidOutput.slice(0, 2000)}`;
}
