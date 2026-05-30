// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentTraceDrawer } from "./agent-trace-drawer";

// True click → drawer interaction tests. Unlike the SSR smoke tests, these mount
// the component in jsdom so effects run: the open click triggers a real fetch,
// the mocked payload populates the tabs, and close paths (✕ / backdrop / Escape)
// are asserted end-to-end.

const ADMIN_PAYLOAD = {
  ok: true,
  run_id: "r1",
  run_status: "completed", // terminal → drawer stops polling after first load
  agent: "architecture",
  mode: "admin",
  status: "completed",
  found: true,
  checks: "Checked architecture, boundaries, and implementation structure.",
  started_at: "2026-05-30T10:00:00.000Z",
  completed_at: "2026-05-30T10:00:02.000Z",
  duration_ms: 2000,
  safe_findings: ["Clear module boundaries", "DI used for providers"],
  missing_proof: [],
  next_action: "Review the evidence linked to this check.",
  score_contribution: { metric: "architecture_score", score: 88 },
  runtime: {
    actual_provider: "anthropic_api",
    actual_model: "claude-opus-4-8",
    input_tokens: 1200,
    output_tokens: 800,
    estimated_cost: "~$0.0780 · claude-opus-4-8 (est.)",
    max_tokens: 2000,
  },
  skill_runs: [],
  evidence_findings: [],
  terminal_runs: [],
  parsed_output: null,
  assertion_results: [],
  hallucinated_files: [],
  errors: [],
  handoff: { ok: true },
  admin_traces: [],
};

function mockFetchOnce(payload: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Parent harness: a button toggles `open`, exactly like the trace list does. */
function Harness({ mode = "admin" as "admin" | "candidate" }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Inspect agent
      </button>
      <AgentTraceDrawer open={open} onOpenChange={setOpen} runId="r1" agentName="architecture" mode={mode} />
    </div>
  );
}

beforeEach(() => {
  mockFetchOnce(ADMIN_PAYLOAD);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AgentTraceDrawer — click → drawer", () => {
  it("is hidden until the trigger is clicked, then opens and loads data", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // Closed initially.
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByText("Inspect agent"));

    // Drawer shell appears immediately.
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.className).toContain("items-center");
    expect(dialog.className).toContain("justify-center");

    // The mocked fetch resolves → Overview content renders.
    expect(await screen.findByText("Clear module boundaries")).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/runs/r1/agents/architecture",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("shows the real estimated cost in the Runtime tab", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("Inspect agent"));
    await screen.findByRole("dialog");

    // Wait for data, then switch to the Runtime tab.
    await screen.findByText("Clear module boundaries");
    await user.click(screen.getByRole("button", { name: "Runtime" }));

    expect(screen.getByText("Estimated cost")).toBeTruthy();
    expect(screen.getByText("~$0.0780 · claude-opus-4-8 (est.)")).toBeTruthy();
  });

  it("closes when the ✕ button is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("Inspect agent"));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("Inspect agent"));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Close agent inspector" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on the Escape key", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("Inspect agent"));
    await screen.findByRole("dialog");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides admin-only tabs in candidate mode", async () => {
    const user = userEvent.setup();
    render(<Harness mode="candidate" />);
    await user.click(screen.getByText("Inspect agent"));
    await screen.findByRole("dialog");

    expect(screen.getByRole("button", { name: "Overview" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Runtime" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Raw JSON" })).toBeNull();
  });
});
