import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword + verifyPassword", () => {
  it("hashes a password and verifies it", async () => {
    const hash = await hashPassword("correcthorsebattery");
    expect(hash).not.toBe("correcthorsebattery");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("correcthorsebattery", hash)).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correcthorsebattery");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("rejects empty inputs to verifyPassword", async () => {
    const hash = await hashPassword("abcdefgh");
    expect(await verifyPassword("", hash)).toBe(false);
    expect(await verifyPassword("abcdefgh", "")).toBe(false);
  });

  it("rejects passwords shorter than 8 chars at hash time", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/password_too_short/);
    await expect(hashPassword("")).rejects.toThrow(/password_too_short/);
  });
});
