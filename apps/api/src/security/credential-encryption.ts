import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function decodeKey(base64Key: string) {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("Scoring credential encryption key must be 32 bytes.");
  return key;
}

export function encryptCredential(credential: string, base64Key: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(credential, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return { ciphertext, iv };
}

export function decryptCredential(ciphertextWithTag: Uint8Array, iv: Uint8Array, base64Key: string) {
  const encrypted = Buffer.from(ciphertextWithTag);
  if (encrypted.length <= AUTH_TAG_LENGTH || iv.length !== IV_LENGTH) throw new Error("Encrypted scoring credential is malformed.");
  const ciphertext = encrypted.subarray(0, -AUTH_TAG_LENGTH);
  const authTag = encrypted.subarray(-AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", decodeKey(base64Key), Buffer.from(iv));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
