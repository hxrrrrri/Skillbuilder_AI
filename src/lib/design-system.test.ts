import { describe, expect, it } from "vitest";
import tailwindConfig from "../../tailwind.config";

type ExtendedTheme = {
  colors: Record<string, string>;
  boxShadow: Record<string, string>;
  borderRadius?: Record<string, string>;
};

function extendedTheme(): ExtendedTheme {
  return tailwindConfig.theme?.extend as ExtendedTheme;
}

describe("design system tokens", () => {
  it("uses the approved warm editorial palette", () => {
    const colors = extendedTheme().colors;

    expect(colors.bg).toBe("#141413");
    expect(colors.panel).toBe("#1f1e1d");
    expect(colors.panel2).toBe("#262522");
    expect(colors.border).toBe("#3d3d3a");
    expect(colors.ink).toBe("#faf9f5");
    expect(colors.muted).toBe("#9c9a92");
    expect(colors.accent).toBe("#d97757");
    expect(colors.accent2).toBe("#c96442");
    expect(colors.good).toBe("#86c994");
  });

  it("keeps elevation quiet and technical", () => {
    const shadows = extendedTheme().boxShadow;

    expect(shadows.card).toBe("0 16px 48px -36px rgba(0,0,0,.72)");
    expect(shadows.glow).toBe("0 0 0 1px rgba(217,119,87,.24), 0 24px 64px -48px rgba(217,119,87,.7)");
  });
});
