import { describe, expect, it } from "vitest";
import { parseProviderJson } from "./json";

describe("parseProviderJson", () => {
  it("extracts the first balanced JSON object from noisy CLI output", () => {
    expect(parseProviderJson('● {"ok":true}\n{"type":"result","exitCode":0}')).toEqual({ ok: true });
  });

  it("does not stop at braces inside strings", () => {
    expect(parseProviderJson('prefix {"message":"look {here}","ok":true} suffix')).toEqual({
      message: "look {here}",
      ok: true,
    });
  });
});
