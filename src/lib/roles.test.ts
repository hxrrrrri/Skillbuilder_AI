import { describe, it, expect } from "vitest";
import {
  TARGET_ROLES,
  CANDIDATE_LEVELS,
  CUSTOM_ROLE_LABEL,
  CUSTOM_LEVEL_LABEL,
  searchRoles,
  isCustomRole,
  isCustomLevel,
} from "./roles";

describe("role catalog", () => {
  it("includes the required core roles and the custom escape hatch", () => {
    const labels = TARGET_ROLES.map((r) => r.label);
    for (const required of ["Frontend Developer", "Backend Developer", "Full-stack Developer", "ML Engineer", "DevOps Engineer"]) {
      expect(labels).toContain(required);
    }
    expect(labels).toContain(CUSTOM_ROLE_LABEL);
  });

  it("levels include the required ladder and Custom Level", () => {
    for (const required of ["Beginner", "Junior", "Senior", "Principal"]) {
      expect(CANDIDATE_LEVELS).toContain(required);
    }
    expect(CANDIDATE_LEVELS).toContain(CUSTOM_LEVEL_LABEL);
  });
});

describe("searchRoles", () => {
  it("returns the full list for an empty query", () => {
    expect(searchRoles("")).toHaveLength(TARGET_ROLES.length);
  });

  it("matches by label substring", () => {
    const out = searchRoles("frontend").map((r) => r.label);
    expect(out).toContain("Frontend Developer");
  });

  it("matches by keyword alias (e.g. 'kotlin' → Android)", () => {
    const out = searchRoles("kotlin").map((r) => r.label);
    expect(out).toContain("Android Developer");
  });

  it("ranks an exact/prefix label match first", () => {
    const out = searchRoles("react");
    expect(out[0].label).toBe("React Developer");
  });

  it("returns nothing for nonsense", () => {
    expect(searchRoles("zzzqqq")).toHaveLength(0);
  });
});

describe("custom flags", () => {
  it("detects the custom sentinels", () => {
    expect(isCustomRole(CUSTOM_ROLE_LABEL)).toBe(true);
    expect(isCustomRole("Frontend Developer")).toBe(false);
    expect(isCustomLevel(CUSTOM_LEVEL_LABEL)).toBe(true);
    expect(isCustomLevel("Senior")).toBe(false);
  });
});
