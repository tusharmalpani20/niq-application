import { expect, test } from "bun:test";
import { listFaceScans, startFaceScan, uploadFaceScan, cancelFaceScan } from "./face-scan-api";

test("stalled face-scan requests abort so the caller can recover the same operation", async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  const budgets: number[] = [];
  AbortSignal.timeout = milliseconds => {
    budgets.push(milliseconds);
    return originalTimeout(5);
  };
  globalThis.fetch = ((_url, init) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) throw new Error("Missing request deadline");
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  })) as typeof fetch;
  try {
    const operations = [
      () => listFaceScans("org", "assessment"),
      () => startFaceScan("org", "assessment", 1, "stable-request-key"),
      () => uploadFaceScan("org", "assessment", "session", { schemaVersion: 1, raw_intensity: [{ r: 1, g: 2, b: 3 }], ppg_time: [0], average_fps: 30 }),
      () => cancelFaceScan("org", "assessment", "session"),
    ];
    for (const operation of operations) await expect(operation()).rejects.toThrow();
    expect(budgets).toEqual([60_000, 60_000, 60_000, 60_000]);
  } finally {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  }
});
