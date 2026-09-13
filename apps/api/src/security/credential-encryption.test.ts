import { describe, expect, test } from "bun:test";
import { decryptCredential, encryptCredential } from "./credential-encryption";

describe("scoring credential encryption", () => {
  const key = Buffer.alloc(32, 7).toString("base64");

  test("round-trips a credential without retaining plaintext", () => {
    const credential = "niq_dep_example.a-secret-deployment-credential";
    const encrypted = encryptCredential(credential, key);
    expect(Buffer.from(encrypted.ciphertext).toString("utf8")).not.toContain(credential);
    expect(decryptCredential(encrypted.ciphertext, encrypted.iv, key)).toBe(credential);
  });

  test("rejects the wrong encryption key", () => {
    const encrypted = encryptCredential("deployment-secret", key);
    expect(() => decryptCredential(encrypted.ciphertext, encrypted.iv, Buffer.alloc(32, 8).toString("base64"))).toThrow();
  });
});
