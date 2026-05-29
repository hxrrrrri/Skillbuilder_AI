import type { ProviderId } from "./types";
export { PROVIDER_MODEL_CATALOG, PROVIDER_MODEL_DEFAULTS } from "./defaults";
import { PROVIDER_MODEL_CATALOG, PROVIDER_MODEL_DEFAULTS } from "./defaults";

export function modelsForProvider(providerId: string, configured: string[] = []): string[] {
  const catalog = PROVIDER_MODEL_CATALOG[providerId as ProviderId] ?? [];
  return Array.from(new Set([...configured, ...catalog].filter(Boolean)));
}

export function defaultModelForProvider(providerId: string, configured?: string | null): string {
  if (configured) return configured;
  return PROVIDER_MODEL_DEFAULTS[providerId as ProviderId] ?? modelsForProvider(providerId)[0] ?? providerId;
}
