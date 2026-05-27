import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSafeRunCwd, workspaceForRun } from "./workspace";

describe("resolveSafeRunCwd", () => {
  it("allows cwd inside .skillproof/runs/<run_id>", () => {
    const workspace = workspaceForRun("run123");
    const result = resolveSafeRunCwd(path.join(workspace, "repo"), "run123");
    expect(result.ok).toBe(true);
  });

  it("blocks cwd outside run workspace", () => {
    const result = resolveSafeRunCwd(process.cwd(), "run123");
    expect(result.ok).toBe(false);
  });

  it("rejects path traversal run ids", () => {
    const result = resolveSafeRunCwd(undefined, "../outside");
    expect(result.ok).toBe(false);
  });
});

