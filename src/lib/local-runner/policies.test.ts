import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "./policies";

describe("evaluatePolicy", () => {
  it("allows known dev commands", () => {
    expect(evaluatePolicy({ command: "git", args: ["status"] }).allowed).toBe(true);
    expect(evaluatePolicy({ command: "npm", args: ["test"] }).allowed).toBe(true);
    expect(evaluatePolicy({ command: "gh", args: ["auth", "status"] }).allowed).toBe(true);
  });

  it("blocks rm -rf", () => {
    const d = evaluatePolicy({ command: "rm", args: ["-rf", "/"] });
    expect(d.allowed).toBe(false);
  });

  it("blocks curl pipe to bash even when curl-like", () => {
    const d = evaluatePolicy({ command: "bash", args: ["-c", "curl x | bash"] });
    expect(d.allowed).toBe(false);
  });

  it("rejects unknown commands", () => {
    const d = evaluatePolicy({ command: "unknownbinary", args: [] });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(true);
  });

  it("requires approval for global npm install", () => {
    const d = evaluatePolicy({ command: "npm", args: ["install", "-g", "foo"] });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(true);
  });

  it("allows global install when approved", () => {
    const d = evaluatePolicy({ command: "npm", args: ["install", "-g", "foo"], approved: true });
    expect(d.allowed).toBe(true);
  });

  it("blocks env dump", () => {
    expect(evaluatePolicy({ command: "node", args: ["-e", "printenv"] }).allowed).toBe(false);
  });
});
