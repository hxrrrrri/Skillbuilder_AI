import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusLight } from "./card";

describe("StatusLight", () => {
  it("renders one pulsing green light for a healthy card", () => {
    const out = renderToStaticMarkup(createElement(StatusLight, { healthy: true }));
    expect(out).toContain("status-light-good");
    expect(out.match(/status-light/g)?.length).toBe(2);
  });

  it("renders one pulsing red light for disabled, untested, or unhealthy cards", () => {
    const out = renderToStaticMarkup(createElement(StatusLight, { healthy: false }));
    expect(out).toContain("status-light-bad");
    expect(out.match(/status-light/g)?.length).toBe(2);
  });
});
