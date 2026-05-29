import type { ProviderHealthStatus } from "@/lib/providers/types";

export type DemoChecklistInput = {
  databaseReady: boolean;
  seededUsersReady: boolean;
  providerRegistryReady: boolean;
  promptVersionsReady: boolean;
  providerHealth: Array<{
    providerId: string;
    label: string;
    status: ProviderHealthStatus | string;
    fix: string;
  }>;
  workerMode: "worker" | "in_process" | "unknown";
  terminalEnabled: boolean;
  publicReportsEnabled: boolean;
  githubTokenConfigured: boolean;
  githubRateLimit: { remaining: number; limit: number; resetAt?: string | null } | null;
};

export type DemoChecklistItem = {
  id: string;
  label: string;
  status: "ready" | "warn" | "blocked";
  detail: string;
  nextAction: string;
};

function item(
  id: string,
  label: string,
  ready: boolean,
  detail: string,
  nextAction: string,
  warn = false,
): DemoChecklistItem {
  return {
    id,
    label,
    status: ready ? "ready" : warn ? "warn" : "blocked",
    detail,
    nextAction: ready ? "Ready." : nextAction,
  };
}

export function buildDemoChecklist(input: DemoChecklistInput): DemoChecklistItem[] {
  const realProviders = input.providerHealth.filter((provider) => provider.providerId !== "deterministic");
  const readyRealProviders = realProviders.filter((provider) => provider.status === "ready");
  const failingProvider = realProviders.find((provider) => provider.status !== "ready");
  const githubDetail = input.githubRateLimit
    ? `${input.githubRateLimit.remaining}/${input.githubRateLimit.limit} GitHub API requests remaining.`
    : input.githubTokenConfigured
      ? "GitHub token configured; rate limit could not be fetched."
      : "No GitHub token configured; unauthenticated GitHub API limit applies.";

  return [
    item("database", "Database ready", input.databaseReady, "Prisma database query succeeded.", "Run npm run db:push."),
    item("seeded_users", "Seeded users ready", input.seededUsersReady, "Demo role accounts exist.", "Run npm run db:seed-users."),
    item("provider_registry", "Provider registry ready", input.providerRegistryReady, "ProviderConfig rows are seeded.", "Run npm run db:seed-registry -- --force."),
    item("prompt_versions", "Prompt versions ready", input.promptVersionsReady, "Active prompt versions are seeded.", "Run npm run db:seed-prompts."),
    item(
      "provider_health",
      "Real provider health",
      readyRealProviders.length > 0,
      readyRealProviders.length
        ? `${readyRealProviders.length} real provider(s) passed health checks.`
        : "No real provider has passed health checks; public scoring remains blocked.",
      failingProvider?.fix ?? "Configure and test Anthropic API, Claude CLI, Codex CLI, Copilot CLI, or Ollama.",
    ),
    item(
      "worker_mode",
      "Worker mode",
      input.workerMode === "worker",
      input.workerMode === "worker" ? "Out-of-process worker mode is enabled." : "API will use local in-process fallback.",
      "Set SKILLPROOF_WORKER_MODE=1 and run npm run demo:worker.",
      input.workerMode !== "unknown",
    ),
    item(
      "terminal_proof",
      "Terminal proof",
      input.terminalEnabled,
      input.terminalEnabled ? "Terminal proof is enabled for this environment." : "Terminal proof is disabled.",
      "For local demo only, set SKILLPROOF_TERMINAL_ENABLED=1.",
      true,
    ),
    item(
      "public_reports",
      "Public reports",
      input.publicReportsEnabled,
      input.publicReportsEnabled ? "Public report export is enabled." : "Public report export is disabled.",
      "Set SKILLPROOF_PUBLIC_REPORTS_ENABLED=1 if public report downloads are needed.",
      true,
    ),
    item(
      "github_token",
      "GitHub token / rate limit",
      input.githubTokenConfigured || !!input.githubRateLimit,
      githubDetail,
      "Set GITHUB_TOKEN to raise GitHub REST limits for live repository previews.",
      true,
    ),
  ];
}
