import { describe, it, expect } from "vitest";
import { mergeModelSources, modelsFromHelp } from "./model-discovery";
import { parseModelList } from "./cli-utils";

describe("mergeModelSources priority", () => {
  it("prefers live over cached and static", () => {
    const out = mergeModelSources({
      live: ["gpt-5.5", "o4-mini"],
      cached: ["gpt-5.0"],
      static: ["gpt-5.5"],
    });
    expect(out.status).toBe("live");
    expect(out.models).toEqual(["gpt-5.5", "o4-mini"]);
  });

  it("falls back to cached when live is empty", () => {
    const out = mergeModelSources({ live: [], cached: ["gpt-5.0", "o3"], static: ["gpt-5.5"] });
    expect(out.status).toBe("cached");
    expect(out.models).toEqual(["gpt-5.0", "o3"]);
  });

  it("uses the static catalog ONLY when live, cached and custom are all empty", () => {
    const out = mergeModelSources({ live: [], cached: [], custom: [], static: ["gpt-5.5"] });
    expect(out.status).toBe("static");
    expect(out.models).toEqual(["gpt-5.5"]);
  });

  it("never uses static when custom models exist", () => {
    const out = mergeModelSources({ live: [], cached: [], custom: ["my-finetune"], static: ["gpt-5.5"] });
    expect(out.status).toBe("custom_only");
    expect(out.options.map((o) => o.value)).toEqual(["my-finetune"]);
    expect(out.options.every((o) => o.source === "custom")).toBe(true);
  });

  it("always appends custom models and tags their source", () => {
    const out = mergeModelSources({ live: ["gpt-5.5"], custom: ["my-finetune"] });
    expect(out.options).toEqual([
      { value: "gpt-5.5", source: "live" },
      { value: "my-finetune", source: "custom" },
    ]);
  });

  it("dedupes across sources", () => {
    const out = mergeModelSources({ live: ["gpt-5.5", "gpt-5.5"], custom: ["gpt-5.5"] });
    expect(out.options.filter((o) => o.value === "gpt-5.5")).toHaveLength(1);
  });
});

describe("parseModelList (shared CLI parser)", () => {
  it("parses a JSON array of model ids", () => {
    expect(parseModelList('["gpt-5.5","o4-mini"]')).toEqual(["gpt-5.5", "o4-mini"]);
  });

  it("parses a JSON object with a models field", () => {
    expect(parseModelList('{"models":[{"id":"gpt-5.5"},{"name":"o4-mini"}]}')).toEqual(["gpt-5.5", "o4-mini"]);
  });

  it("parses a plain-text bullet/line list", () => {
    const out = parseModelList("Available models:\n- gpt-5.5\n- o4-mini\n* claude-opus-4-8");
    expect(out).toContain("gpt-5.5");
    expect(out).toContain("o4-mini");
    expect(out).toContain("claude-opus-4-8");
  });
});

describe("modelsFromHelp scraping", () => {
  it("extracts model identifiers mentioned in help text", () => {
    const help = "Usage: codex exec --model <gpt-5.5|o4-mini>  (default gpt-5.5). Also supports claude-opus-4-8.";
    const out = modelsFromHelp(help);
    expect(out).toContain("gpt-5.5");
    expect(out).toContain("o4-mini");
    expect(out).toContain("claude-opus-4-8");
  });

  it("returns nothing for help with no model mentions", () => {
    expect(modelsFromHelp("Usage: tool [options]")).toEqual([]);
  });
});
