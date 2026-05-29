// Local runner shared types.

export type ExecutionMode = "api" | "cli" | "hybrid" | "local";

export type ToolCapability =
  | "git"
  | "github_api"
  | "github_auth"
  | "llm"
  | "llm_local"
  | "shell";

export type DetectedTool = {
  name: string;
  installed: boolean;
  command: string;
  version: string | null;
  authenticated: boolean;
  authStatus: string | null;
  capabilities: ToolCapability[];
  setupHint?: string;
  error?: string | null;
};

export type DetectionReport = {
  detectedAt: string;
  platform: NodeJS.Platform;
  tools: DetectedTool[];
  recommendedMode: ExecutionMode;
  reasons: string[];
};

export type CommandStatus = "running" | "completed" | "timeout" | "blocked" | "error";

export type CommandRun = {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  startedAt: string;
  completedAt: string | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  status: CommandStatus;
};

export type TerminalEvidence = {
  commandRunId?: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  stdoutSummary: string;
  stderrSummary: string;
  durationMs: number;
  usedFor: "install" | "testing" | "build" | "git" | "security" | "ownership" | "agent" | "typecheck" | "lint" | "ai_challenge";
  statusLabel?: "install_pending_approval" | "install_completed" | "skipped" | "passed" | "failed";
  outputSha256?: string;
  redactionWarning?: boolean;
  evidenceSource?: "sandbox_terminal" | "local_proof_runner" | "ai_challenge_workspace";
  includeInReport?: boolean;
};

export type PolicyDecision = {
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
  redactedCommand?: string;
};

export type LocalProofPolicy = {
  allowInstall: boolean;
  installRequiresApproval: boolean;
  installApproved: boolean;
  maxInstallMs: number;
  maxCommandMs: number;
  networkAllowed: boolean;
  packageManagersAllowed: Array<"npm" | "pnpm" | "yarn" | "bun">;
  workspaceRoot: string;
};
