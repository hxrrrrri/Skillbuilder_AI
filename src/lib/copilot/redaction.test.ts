import { describe, expect, it } from "vitest";
import { redactDeep, redactText, isSecretKey, REDACTED } from "./redaction";

describe("copilot redaction (#13 chat context redacts secrets)", () => {
  it("masks secret-shaped strings in free text", () => {
    const out = redactText("key is sk-ant-abc123DEF456ghi789 ok");
    expect(out).toContain(REDACTED);
    expect(out).not.toContain("sk-ant-abc123DEF456ghi789");
  });

  it("masks GitHub tokens and JWTs", () => {
    expect(redactText("ghp_0123456789abcdefghijABCDEFGHIJ012345")).toBe(REDACTED);
    expect(redactText("token eyJabcdefghij.eyJpayload1234.signature9876 end")).toContain(REDACTED);
  });

  it("masks literal env values present in the process environment", () => {
    const env = { ANTHROPIC_API_KEY: "super-secret-value-1234567" } as any;
    const out = redactText("the configured key is super-secret-value-1234567 here", env);
    expect(out).not.toContain("super-secret-value-1234567");
    expect(out).toContain(REDACTED);
  });

  it("redacts secret-named keys, keeps non-secret fields", () => {
    const obj = {
      apiKey: "sk-live-abcdefghijklmnopqrst",
      password: "hunter2hunter2",
      label: "Anthropic API",
      providerId: "anthropic_api",
      nested: { authorization: "Bearer abc", safe: "ok" },
    };
    const out = redactDeep(obj) as any;
    expect(out.label).toBe("Anthropic API");
    expect(out.providerId).toBe("anthropic_api");
    expect(out.apiKey).toBe(REDACTED);
    expect(out.password).toBe(REDACTED);
    expect(out.nested.authorization).toBe(REDACTED);
    expect(out.nested.safe).toBe("ok");
  });

  it("isSecretKey detects common secret key names", () => {
    expect(isSecretKey("password")).toBe(true);
    expect(isSecretKey("apiKey")).toBe(true);
    expect(isSecretKey("access_token")).toBe(true);
    expect(isSecretKey("label")).toBe(false);
  });
});
