// Dynamic model discovery.
//
// Provider model dropdowns must show the models that are ACTUALLY available
// right now, not a stale hardcoded list. This module probes each provider for
// its live model list (CLI subcommands, --help parsing, or a local API), then
// merges the result with the last-cached discovery, admin custom models, and the
// static fallback catalog — in that priority order. The static catalog is only
// ever used when nothing else is available, so a real `gpt-5.5`-only fallback is
// never shown when the CLI reports more.

import { prisma } from "@/lib/db";
import { probe, combinedOutput, parseModelList } from "./cli-utils";
import { modelsForProvider, PROVIDER_MODEL_CATALOG } from "./model-catalog";
import { saveDiscoveredModels } from "./registry";
import type { ProviderId } from "./types";

export type ModelSource = "live" | "cached" | "static" | "custom";
export type DiscoveryStatus = "live" | "cached" | "static" | "custom_only" | "failed";

export type ModelOption = { value: string; source: ModelSource };

export type DiscoveryResult = {
  providerId: string;
  models: string[];
  /** Where the PRIMARY (non-custom) list came from. */
  status: DiscoveryStatus;
  error: string | null;
};

export type ModelOptions = {
  providerId: string;
  options: ModelOption[];
  status: DiscoveryStatus;
  discoveredAt: string | null;
  error: string | null;
  customModels: string[];
};

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

function dedupe(models: Array<string | null | undefined>): string[] {
  return Array.from(new Set(models.map((m) => (m ?? "").trim()).filter(Boolean)));
}

/**
 * Merge model sources by priority: live > cached > static for the primary list,
 * with custom models always appended. Returns the chosen primary list, the
 * status describing where it came from, and the merged option list (deduped,
 * custom-tagged). Static is used ONLY when live + cached + custom are all empty.
 */
export function mergeModelSources(input: {
  live?: string[];
  cached?: string[];
  custom?: string[];
  static?: string[];
}): { models: string[]; status: DiscoveryStatus; options: ModelOption[] } {
  const live = dedupe(input.live ?? []);
  const cached = dedupe(input.cached ?? []);
  const custom = dedupe(input.custom ?? []);
  const fallback = dedupe(input.static ?? []);

  let primary: string[];
  let status: DiscoveryStatus;
  let primarySource: ModelSource;
  if (live.length) {
    primary = live;
    status = "live";
    primarySource = "live";
  } else if (cached.length) {
    primary = cached;
    status = "cached";
    primarySource = "cached";
  } else if (custom.length) {
    primary = [];
    status = "custom_only";
    primarySource = "custom";
  } else {
    primary = fallback;
    status = "static";
    primarySource = "static";
  }

  const options: ModelOption[] = [];
  const seen = new Set<string>();
  for (const m of primary) {
    if (seen.has(m)) continue;
    seen.add(m);
    options.push({ value: m, source: primarySource });
  }
  for (const m of custom) {
    if (seen.has(m)) continue;
    seen.add(m);
    options.push({ value: m, source: "custom" });
  }
  return { models: primary, status, options };
}

// ── Live probing per provider ────────────────────────────────────────────────

/** Codex CLI: try several model subcommands, then parse help text. */
async function discoverCodex(command = "codex"): Promise<string[]> {
  const attempts: string[][] = [
    ["models", "--json"],
    ["model", "list", "--json"],
    ["models"],
    ["model", "list"],
    ["--list-models"],
  ];
  for (const args of attempts) {
    const run = await probe(command, args, 4000);
    if (run.exitCode !== 0) continue;
    const models = parseModelList(combinedOutput(run));
    if (models.length) return models;
  }
  // Fall back to scraping `--help` / `exec --help` for model mentions.
  const help = `${combinedOutput(await probe(command, ["--help"], 4000))}\n${combinedOutput(
    await probe(command, ["exec", "--help"], 4000),
  )}`;
  return modelsFromHelp(help);
}

/** Claude CLI: `claude models` / `model list`, then help parsing. */
async function discoverClaude(command = "claude"): Promise<string[]> {
  for (const args of [["models"], ["model", "list"]]) {
    const run = await probe(command, args, 4000);
    if (run.exitCode !== 0) continue;
    const models = parseModelList(combinedOutput(run));
    if (models.length) return models;
  }
  return modelsFromHelp(combinedOutput(await probe(command, ["--help"], 4000)));
}

/** Ollama: local /api/tags, then `ollama list`. */
async function discoverOllama(baseUrl = "http://localhost:11434", command = "ollama"): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const r = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
      if (r.ok) {
        const data: any = await r.json();
        const names = (Array.isArray(data?.models) ? data.models : [])
          .map((m: any) => String(m?.name ?? m?.model ?? ""))
          .filter(Boolean);
        if (names.length) return names;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    /* fall through to CLI */
  }
  const run = await probe(command, ["list"], 3000);
  if (run.exitCode === 0) {
    // `ollama list` prints a table; first column is the model name.
    const names = combinedOutput(run)
      .split(/\r?\n/)
      .slice(1) // drop header row
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((n) => n && !/^name$/i.test(n));
    if (names.length) return Array.from(new Set(names));
  }
  return [];
}

/** Extract plausible model identifiers mentioned in help text. */
export function modelsFromHelp(help: string): string[] {
  const found = new Set<string>();
  // patterns like gpt-5.5, o4-mini, claude-opus-4-8, gemma3:4b
  const re = /\b((?:gpt|o\d|claude|gemini|llama|gemma|mistral|qwen|deepseek|phi)[a-z0-9._:-]{1,40})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(help))) found.add(m[1]);
  return Array.from(found);
}

async function probeLiveModels(providerId: string, cfg: any): Promise<string[]> {
  const command = cfg?.command ?? undefined;
  switch (providerId) {
    case "codex_cli":
      return discoverCodex(command ?? "codex");
    case "claude_cli":
      return discoverClaude(command ?? "claude");
    case "ollama":
      return discoverOllama(cfg?.baseUrl ?? "http://localhost:11434", command ?? "ollama");
    // anthropic_api / copilot_cli / deterministic have no safe live list endpoint
    // here — they rely on curated catalog + admin custom models.
    default:
      return [];
  }
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Probe a provider's live models. Never throws — failures return status failed. */
export async function discoverModelsForProvider(providerId: string): Promise<DiscoveryResult> {
  let cfg: any = null;
  try {
    cfg = await prisma.providerConfig.findUnique({ where: { providerId } });
  } catch {
    /* DB optional for discovery */
  }
  try {
    const live = await probeLiveModels(providerId, cfg);
    if (live.length) {
      return { providerId, models: dedupe(live), status: "live", error: null };
    }
    // No live models — surface cached if present, else static.
    const cached = parseJsonArray(cfg?.discoveredModelsJson);
    if (cached.length) return { providerId, models: cached, status: "cached", error: null };
    return { providerId, models: PROVIDER_MODEL_CATALOG[providerId as ProviderId] ?? [], status: "static", error: null };
  } catch (err: any) {
    const cached = parseJsonArray(cfg?.discoveredModelsJson);
    return {
      providerId,
      models: cached.length ? cached : PROVIDER_MODEL_CATALOG[providerId as ProviderId] ?? [],
      status: cached.length ? "cached" : "failed",
      error: err?.message ?? String(err),
    };
  }
}

/**
 * Resolve the full model option list for a dropdown WITHOUT probing live (reads
 * the cached discovery + custom + static). Cheap; safe to call on render.
 */
export async function getModelOptionsForProvider(providerId: string): Promise<ModelOptions> {
  let cfg: any = null;
  try {
    cfg = await prisma.providerConfig.findUnique({ where: { providerId } });
  } catch {
    /* DB optional */
  }
  const cached = parseJsonArray(cfg?.discoveredModelsJson);
  const custom = parseJsonArray(cfg?.customModelsJson);
  const fallback = modelsForProvider(providerId);
  const merged = mergeModelSources({ cached, custom, static: fallback });
  return {
    providerId,
    options: merged.options,
    status: cfg?.modelDiscoveryStatus ?? merged.status,
    discoveredAt: cfg?.modelsDiscoveredAt ? new Date(cfg.modelsDiscoveredAt).toISOString() : null,
    error: cfg?.modelDiscoveryError ?? null,
    customModels: custom,
  };
}

/** Probe live, persist the result, and return the refreshed option list. */
export async function refreshProviderModels(providerId: string): Promise<ModelOptions> {
  const result = await discoverModelsForProvider(providerId);
  const refreshedAt = new Date().toISOString();
  try {
    await saveDiscoveredModels(providerId, { models: result.models, status: result.status, error: result.error });
  } catch {
    /* persistence is best-effort */
  }
  const options = await getModelOptionsForProvider(providerId);
  if (result.status !== "live") return options;

  const merged = mergeModelSources({
    live: result.models,
    custom: options.customModels,
    static: modelsForProvider(providerId),
  });
  return {
    ...options,
    options: merged.options,
    status: "live",
    discoveredAt: refreshedAt,
    error: result.error,
  };
}
