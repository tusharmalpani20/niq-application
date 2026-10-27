// Called only by the isolated restore drill. Secrets and bytes arrive on stdin.
import { createHash } from "node:crypto";
import { decryptPatientBytes, patientDataKey } from "../../apps/api/src/security/patient-data";

try {
  const value = JSON.parse(await Bun.stdin.text());
  const pdf = decryptPatientBytes(Buffer.from(value.ciphertext, "base64"), patientDataKey(value.key || undefined, value.session));
  if (pdf.subarray(0, 5).toString() !== "%PDF-" || pdf.length !== value.size ||
      createHash("sha256").update(pdf).digest("hex") !== value.sha256) {
    throw new Error("Invalid restored artifact");
  }
  console.log("Restored encrypted PDF decrypted and verified");
} catch {
  console.error("Restored encrypted PDF verification failed");
  process.exit(1);
}
