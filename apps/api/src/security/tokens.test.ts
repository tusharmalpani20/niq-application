import { describe, expect, test } from "bun:test";
import { hashPassword, keyedHash, randomOtp, randomToken, secureEqual, verifyPassword } from "./tokens";

describe("authentication primitives", () => {
  test("hashes passwords with Argon2id and verifies without storing plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  test("creates opaque tokens, six-digit OTPs, and keyed hashes", async () => {
    expect(randomToken()).toHaveLength(43);
    expect(randomOtp()).toMatch(/^\d{6}$/);
    expect(await keyedHash("token", "a".repeat(32))).toHaveLength(64);
  });

  test("uses exact constant-work comparison for same-length secrets", () => {
    expect(secureEqual("same", "same")).toBe(true);
    expect(secureEqual("same", "diff")).toBe(false);
    expect(secureEqual("short", "longer")).toBe(false);
  });
});
