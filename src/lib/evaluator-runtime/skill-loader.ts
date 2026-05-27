import fs from "node:fs";
import path from "node:path";
import type { EvaluatorSkillManifest, ToolPermissionPolicy } from "./skill-contracts";
import { defaultPolicy } from "./permission-policy";

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^["']|["']$/g, "");
}

function parseFrontmatter(raw: string): Record<string, any> {
  const out: Record<string, any> = {};
  let currentKey: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^\s+-\s+/.test(line) && currentKey) {
      if (!Array.isArray(out[currentKey])) out[currentKey] = [];
      out[currentKey].push(parseScalar(line.replace(/^\s+-\s+/, "")));
      continue;
    }
    if (/^\s{2,}[A-Za-z0-9_-]+:/.test(line) && currentKey) {
      if (!out[currentKey] || Array.isArray(out[currentKey])) out[currentKey] = {};
      const idx = line.indexOf(":");
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      out[currentKey][key] = parseScalar(value);
      continue;
    }
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    currentKey = key;
    out[key] = value ? parseScalar(value) : [];
  }
  return out;
}

export function loadSkillFile(sourcePath: string, root = process.cwd()): EvaluatorSkillManifest {
  const abs = path.resolve(root, sourcePath);
  const text = fs.readFileSync(abs, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`Evaluator skill missing frontmatter: ${sourcePath}`);
  const fm = parseFrontmatter(match[1]);
  const toolPermissions = { ...defaultPolicy(), ...(fm.toolPermissions ?? {}) } as ToolPermissionPolicy;
  return {
    id: String(fm.id ?? ""),
    name: String(fm.name ?? ""),
    version: String(fm.version ?? "1.0.0"),
    category: fm.category,
    visibility: (fm.visibility ?? "internal") as EvaluatorSkillManifest["visibility"],
    allowedRoles: Array.isArray(fm.allowedRoles) ? fm.allowedRoles.map(String) : [],
    requiredInputs: Array.isArray(fm.requiredInputs) ? fm.requiredInputs.map(String) : [],
    produces: Array.isArray(fm.produces) ? fm.produces.map(String) : [],
    toolPermissions,
    riskLevel: (fm.riskLevel ?? "low") as EvaluatorSkillManifest["riskLevel"],
    description: fm.description ? String(fm.description) : undefined,
    sourcePath,
    body: match[2].trim(),
  };
}
