import { describe, expect, it } from "vitest";
import { redact } from "./redact";

describe("redact", () => {
  it("redacts anthropic key", () => {
    const out = redact("key=sk-ant-abcdef0123456789ABCDEF tail");
    expect(out).toContain("[REDACTED_ANTHROPIC_KEY]");
    expect(out).not.toContain("sk-ant-abcdef");
  });

  it("redacts github PAT", () => {
    const out = redact("token=ghp_AAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(out).toContain("[REDACTED_GITHUB_PAT]");
  });

  it("redacts JWT-like strings", () => {
    const out = redact("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJqb2huIn0.signaturestring1234567");
    expect(out).toContain("[REDACTED_JWT]");
  });

  it("redacts env-style assignments", () => {
    const out = redact("ANTHROPIC_API_KEY=sk-ant-xyz123456789012345678");
    expect(out).toMatch(/ANTHROPIC_API_KEY=\[REDACTED\]/);
  });

  it("leaves harmless text alone", () => {
    expect(redact("hello world")).toBe("hello world");
  });
});
