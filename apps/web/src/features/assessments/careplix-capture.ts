import type { FaceScanSignal } from "@niq/application-contracts";

type Frame = { message: string; progress: number; type: string; isLiteMode: boolean; isThrottling: boolean };
export interface CaptureSDK {
  facescan: {
    onFrame(callback: (frame: Frame) => void): void;
    onScanFinish(callback: (signal: Omit<FaceScanSignal, "schemaVersion">) => void): void;
    onError(callback: (error: Error, code: string) => void): void;
    startScan(options: { videoElement: HTMLVideoElement; canvasElement: HTMLCanvasElement; scanDuration: number; tryHDCamera: boolean }): Promise<void>;
    stopScan(): void;
  };
}
const errorMessages: Record<string, string> = {
  FCINT01: "Scan files could not load. Check your internet connection and try again.",
  FCSCN01: "A face could not be detected. Check the lighting and position, then try again.",
  CMUSR01: "Camera access is unavailable. Allow camera access and check that another app is not using it.",
  CMUSR02: "Capture stopped because the scan window lost focus. Click Resume capture and keep this page focused. Do not click the chat panel, another tab or another app until capture finishes.",
  CMSCN01: "The camera signal could not be captured. Please try again.",
};

// The SDK singleton survives component unmounts, so its startup barrier must too.
let startup: Promise<void> = Promise.resolve();

/** A generation belongs to one capture. Late SDK promises/callbacks cannot restart a cancelled camera. */
export function createCaptureController(load: () => Promise<CaptureSDK> = () => import("careplix-scan-sdk")) {
  let generation = 0;
  let sdk: CaptureSDK | null = null;
  let video: HTMLVideoElement | null = null;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  function stopCamera() {
    clearTimeout(watchdog);
    try { sdk?.facescan.stopScan(); } catch { /* Track cleanup must still run after SDK errors. */ }
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks?.().forEach(track => track.stop());
    if (video) video.srcObject = null;
  }
  function cancel() { generation++; stopCamera(); }
  async function start(elements: { video: HTMLVideoElement; canvas: HTMLCanvasElement }, callbacks: {
    frame: (frame: Frame) => void; finish: (signal: FaceScanSignal) => void; error: (message: string) => void;
  }) {
    cancel();
    const current = generation;
    video = elements.video;
    let settled = false;
    const active = () => current === generation && !settled;
    const fail = (code: string) => {
      if (!active()) return;
      settled = true; stopCamera(); callbacks.error(errorMessages[code] ?? "Could not start the camera scan. Check camera permissions and try again.");
    };
    try {
      // The vendor SDK is a singleton. Serialize startup so a cancelled, late
      // getUserMedia/startScan promise cannot stop a newer capture's camera.
      await startup;
      if (!active()) return;
      sdk = await load();
      if (!active()) return;
      sdk.facescan.onFrame(frame => { if (active()) callbacks.frame({ ...frame, progress: Math.max(0, Math.min(100, Number.isFinite(frame.progress) ? frame.progress : 0)) }); });
      sdk.facescan.onError((_error, code) => fail(code));
      sdk.facescan.onScanFinish(signal => {
        if (!active()) return;
        settled = true; stopCamera(); callbacks.finish({ ...signal, schemaVersion: 1 });
      });
      // Local watchdog only cancels capture; it does not assert provider failure or billability.
      watchdog = setTimeout(() => fail("FCSCN01"), 180_000);
      startup = sdk.facescan.startScan({ videoElement: elements.video, canvasElement: elements.canvas, scanDuration: 60, tryHDCamera: false });
      await startup;
      if (!active()) stopCamera();
    } catch { startup = Promise.resolve(); fail("CMUSR01"); }
  }
  return { start, cancel };
}
