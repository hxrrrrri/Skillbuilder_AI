import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TraceEventList } from "./trace-event-list";

describe("TraceEventList", () => {
  it("renders pipeline events as clickable inspector cards", () => {
    const out = renderToStaticMarkup(
      createElement(TraceEventList, {
        runId: "run-1",
        events: [{
          id: "event-1",
          agent: "architecture",
          status: "completed",
          order: 0,
          startedAt: "2026-05-30T10:00:00.000Z",
          completedAt: "2026-05-30T10:00:02.000Z",
          notes: "Checked boundaries",
          output: null,
        }],
      }),
    );

    expect(out).toContain("grid gap-4 md:grid-cols-2 xl:grid-cols-3");
    expect(out).toContain("Open live inspector");
    expect(out).toContain("status-light-good");
  });
});
