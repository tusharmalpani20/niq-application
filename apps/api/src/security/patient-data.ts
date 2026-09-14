import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function patientDataKey(configuredKey: string | undefined, sessionSecret: string): Buffer {
  if (configuredKey) {
    const key = Buffer.from(configuredKey, "base64");
    if (key.length !== 32) throw new Error("Patient data encryption key must be 32 bytes.");
    return key;
  }
  return createHash("sha256").update("niq-patient-data-v1\0").update(sessionSecret).digest();
}

export function encryptPatientData(value: string, key: Uint8Array): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]);
}

export function decryptPatientData(value: Uint8Array, key: Uint8Array): string {
  const encrypted = Buffer.from(value);
  if (encrypted.length <= IV_LENGTH + AUTH_TAG_LENGTH) throw new Error("Encrypted patient data is malformed.");
  const iv = encrypted.subarray(0, IV_LENGTH);
  const authTag = encrypted.subarray(-AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(IV_LENGTH, -AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
