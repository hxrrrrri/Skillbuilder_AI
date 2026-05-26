import { describe, expect, it } from "vitest";
import { parseRepoUrl, slugify, clamp, safeJsonParse } from "./utils";

describe("parseRepoUrl", () => {
  it("parses canonical github URL", () => {
    expect(parseRepoUrl("https://github.com/owner/repo")).toEqual({ owner: "owner", repo: "repo" });
  });
  it("strips .git suffix", () => {
    expect(parseRepoUrl("https://github.com/owner/repo.git")).toEqual({ owner: "owner", repo: "repo" });
  });
  it("handles trailing path segments", () => {
    expect(parseRepoUrl("https://github.com/owner/repo/tree/main")).toEqual({ owner: "owner", repo: "repo" });
  });
  it("rejects non-github hosts", () => {
    expect(parseRepoUrl("https://gitlab.com/owner/repo")).toBeNull();
  });
  it("rejects bare hostnames", () => {
    expect(parseRepoUrl("https://github.com/")).toBeNull();
  });
  it("rejects garbage", () => {
    expect(parseRepoUrl("not a url")).toBeNull();
  });
});

describe("slugify", () => {
  it("lowercases and dashes", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });
  it("collapses runs", () => {
    expect(slugify("foo___bar---baz")).toBe("foo-bar-baz");
  });
  it("trims edges", () => {
    expect(slugify(" --foo--")).toBe("foo");
  });
  it("caps at 60 chars", () => {
    expect(slugify("a".repeat(120)).length).toBe(60);
  });
});

describe("clamp", () => {
  it("default range 0-100", () => {
    expect(clamp(-5)).toBe(0);
    expect(clamp(150)).toBe(100);
    expect(clamp(42)).toBe(42);
  });
});

describe("safeJsonParse", () => {
  it("returns fallback for null", () => {
    expect(safeJsonParse(null, { x: 1 })).toEqual({ x: 1 });
  });
  it("returns fallback for invalid JSON", () => {
    expect(safeJsonParse("{nope", [])).toEqual([]);
  });
  it("parses valid JSON", () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });
});
