import { expect, test } from "bun:test";
import { createCaptureController, type CaptureSDK } from "./careplix-capture";

function fixture(startScan: CaptureSDK["facescan"]["startScan"] = async () => {}) {
  let frame: Parameters<CaptureSDK["facescan"]["onFrame"]>[0] = () => {};
  let finish: Parameters<CaptureSDK["facescan"]["onScanFinish"]>[0] = () => {};
  let error: Parameters<CaptureSDK["facescan"]["onError"]>[0] = () => {};
  let stops = 0, tracks = 0;
  const sdk: CaptureSDK = { facescan: { onFrame: fn => { frame = fn; }, onScanFinish: fn => { finish = fn; }, onError: fn => { error = fn; }, startScan, stopScan: () => { stops++; } } };
  const video = { srcObject: { getTracks: () => [{ stop: () => { tracks++; } }] } } as unknown as HTMLVideoElement;
  const elements = { video, canvas: {} as HTMLCanvasElement };
  return { sdk, elements, frame: (progress: number) => frame({ progress, message: "Still", type: "scan", isLiteMode: false, isThrottling: false }), finish: () => finish({ raw_intensity: [{ r: 1, g: 2, b: 3 }], ppg_time: [0], average_fps: 30 }), error: () => error(new Error("private upstream detail"), "CMUSR01"), counts: () => ({ stops, tracks }) };
}
test("finishes once, releases camera and ignores duplicate/error frames after finish", async () => {
  const f = fixture(), controller = createCaptureController(async () => f.sdk);
  let results = 0, errors = 0, progress = 0;
  await controller.start(f.elements, { frame: f => { progress = f.progress; }, finish: signal => { expect(signal.schemaVersion).toBe(1); results++; }, error: () => { errors++; } });
  f.frame(120); expect(progress).toBe(100);
  f.finish(); f.finish(); f.error(); f.frame(12);
  expect(results).toBe(1); expect(errors).toBe(0); expect(progress).toBe(100);
  expect(f.counts().tracks).toBe(1); expect(f.elements.video.srcObject).toBeNull();
  controller.cancel();
});
test("cancel during SDK download never starts the camera", async () => {
  let resolve!: (sdk: CaptureSDK) => void, starts = 0;
  const loaded = new Promise<CaptureSDK>(r => { resolve = r; });
  const f = fixture(async () => { starts++; });
  const controller = createCaptureController(() => loaded);
  const work = controller.start(f.elements, { frame: () => {}, finish: () => { throw new Error("late result"); }, error: () => { throw new Error("late error"); } });
  await Promise.resolve(); controller.cancel(); resolve(f.sdk); await work;
  expect(starts).toBe(0);
});
test("camera startup cancellation settles before a subsequent start", async () => {
  let resolve!: () => void, starts = 0;
  const deferred = new Promise<void>(r => { resolve = r; });
  const f = fixture(async () => { starts++; if (starts === 1) await deferred; });
  const controller = createCaptureController(async () => f.sdk);
  const callbacks = { frame: () => {}, finish: () => {}, error: () => {} };
  const first = controller.start(f.elements, callbacks);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  controller.cancel(); const second = controller.start(f.elements, callbacks);
  await Promise.resolve(); expect(starts).toBe(1);
  resolve(); await first; await second; expect(starts).toBe(2); controller.cancel();
});
test("SDK errors are user-safe and stop capture", async () => {
  const f = fixture(), controller = createCaptureController(async () => f.sdk);
  let message = "";
  await controller.start(f.elements, { frame: () => {}, finish: () => {}, error: value => { message = value; } });
  f.error(); expect(message).toContain("Camera access"); expect(message).not.toContain("private"); expect(f.counts().tracks).toBe(1); controller.cancel();
});
