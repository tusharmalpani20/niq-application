import { expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { encryptPatientBytes } from "../../apps/api/src/security/patient-data";

async function verify(tamper: boolean) {
  const key = randomBytes(32);
  const pdf = Buffer.from("%PDF-1.7\nSynthetic restore drill fixture\n%%EOF");
  const ciphertext = encryptPatientBytes(pdf, key);
  if (tamper) ciphertext[14] ^= 1;
  const payload = { key: key.toString("base64"), session: "unused-test-session", ciphertext: ciphertext.toString("base64"),
    sha256: createHash("sha256").update(pdf).digest("hex"), size: pdf.length };
  const child = Bun.spawn([process.execPath, `${import.meta.dir}/verify_pdf.ts`], {
    stdin: new Blob([JSON.stringify(payload)]), stdout: "pipe", stderr: "pipe",
  });
  return { code: await child.exited, output: await new Response(child.stdout).text(), error: await new Response(child.stderr).text() };
}

test("isolated restore verifies saved PDF with recovered encryption key", async () => {
  const result = await verify(false);
  expect(result.code).toBe(0);
  expect(result.output).toContain("decrypted and verified");
});

test("isolated restore fails on damaged encrypted PDF without exposing bytes", async () => {
  const result = await verify(true);
  expect(result.code).toBe(1);
  expect(result.error).toBe("Restored encrypted PDF verification failed\n");
  expect(result.output).toBe("");
});
