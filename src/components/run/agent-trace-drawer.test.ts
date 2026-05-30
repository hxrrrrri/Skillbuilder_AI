import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentTraceDrawer } from "./agent-trace-drawer";

// Note: data fetching/polling is exercised against the live endpoint at runtime
// (effects do not run under renderToStaticMarkup). These smoke tests assert the
// drawer's open/closed shell and mode-specific tab surface.

describe("AgentTraceDrawer", () => {
  it("renders nothing when closed", () => {
    const out = renderToStaticMarkup(
      createElement(AgentTraceDrawer, { open: false, onOpenChange: () => {}, runId: "r1", agentName: "architecture", mode: "admin" }),
    );
    expect(out).toBe("");
  });

  it("opens a dialog shell with the agent name and admin tabs", () => {
    const out = renderToStaticMarkup(
      createElement(AgentTraceDrawer, { open: true, onOpenChange: () => {}, runId: "r1", agentName: "architecture", mode: "admin" }),
    );
    expect(out).toContain('role="dialog"');
    expect(out).toContain("architecture");
    expect(out).toContain("Runtime");
    expect(out).toContain("Raw JSON");
    expect(out).toContain("polling"); // live footer while not yet terminal
  });

  it("hides admin-only tabs in candidate mode", () => {
    const out = renderToStaticMarkup(
      createElement(AgentTraceDrawer, { open: true, onOpenChange: () => {}, runId: "r1", agentName: "architecture", mode: "candidate" }),
    );
    expect(out).toContain("Overview");
    expect(out).toContain("Evidence");
    expect(out).not.toContain("Raw JSON");
    expect(out).not.toContain("Runtime");
  });
});
