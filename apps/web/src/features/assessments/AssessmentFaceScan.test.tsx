import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { AssessmentWorkflow, FaceScanList, FaceScanSession } from "@niq/application-contracts";
import { AssessmentFaceScan, type MissingScanInput } from "./AssessmentFaceScan";
import { createCaptureController, type CaptureSDK } from "./careplix-capture";

const session: FaceScanSession = { id: "session", state: "REQUESTED", context: { dob: "1990-01-01", gender: "female", heightCm: 170, weightKg: 70, posture: "resting", employeeId: "employee" }, createdAt: "2026-09-20T12:00:00.000Z", updatedAt: "2026-09-20T12:00:00.000Z", completedAt: null, failureCode: null, result: null, score: null };
async function harness(run: (ctx: { click: (text: string) => Promise<void>; consent: () => Promise<void>; finish: () => Promise<void>; frame: (message: string) => Promise<void>; requests: Array<{ path: string; body: any }>; starts: () => number; saved: () => number; busy: () => boolean; missing: () => MissingScanInput[]; releaseStatus: () => Promise<void>; setCurrent: (value: FaceScanSession) => Promise<void> }) => Promise<void>, options: { enabled?: boolean; existing?: FaceScanSession; history?: FaceScanSession[]; lostUpload?: boolean; delayedStatus?: boolean; hiddenDuringSave?: boolean; lostStart?: boolean; weight?: number | null; demoConsentEnabled?: boolean } = {}) {
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", { url: "https://niq.test", pretendToBeVisual: true });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "NodeFilter", "DocumentFragment", "HTMLButtonElement", "HTMLInputElement", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values: Record<string, unknown> = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true };
  Object.defineProperty(dom.window.navigator, "mediaDevices", { value: { getUserMedia: () => { throw new Error("Real camera must not be used in this test"); } } });
  const requests: Array<{ path: string; body: any }> = [];
  let current = options.existing ?? null, starts = 0, saves = 0, busy = false, reads = 0, missing: MissingScanInput[] = [];
  let releaseStatus: () => void = () => {};
  let finish: Parameters<CaptureSDK["facescan"]["onScanFinish"]>[0] = () => {};
  let onFrame: Parameters<CaptureSDK["facescan"]["onFrame"]>[0] = () => {};
  const sdk: CaptureSDK = { facescan: { onFrame: fn => { onFrame = fn; }, onError: () => {}, onScanFinish: fn => { finish = fn; }, startScan: async () => { starts++; }, stopScan: () => {} } };
  values.fetch = async (input: string, init?: RequestInit) => {
    const path = String(input), body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ path, body });
    if (path.endsWith("/signal")) { current = { ...session, state: "UPLOAD_ACCEPTED" }; if (options.lostUpload) throw new Error("connection lost"); return Response.json(current); }
    if (path.endsWith("/cancel")) { current = { ...session, state: "CANCELLED" }; return Response.json(current); }
    if (init?.method === "POST") { current = session; if (options.lostStart) throw new Error("Start response lost"); return Response.json(current); }
    const list: FaceScanList = { enabled: options.enabled ?? true, currentSessionId: current?.id ?? null, sessions: [...(current ? [current] : []), ...(options.history ?? [])] };
    if (options.delayedStatus && ++reads === 2) return new Promise<Response>(resolve => { releaseStatus = () => resolve(Response.json(list)); });
    return Response.json(list);
  };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  const root = createRoot(document.getElementById("root")!);
  const record = { id: "assessment", revision: 3, status: "DRAFT", patient: { dateOfBirth: "1990-01-01", gender: "FEMALE" }, answers: { height_cm: 170, current_weight_kg: options.weight === undefined ? 70 : options.weight } } as AssessmentWorkflow;
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    await act(async () => { root.render(<AssessmentFaceScan organizationId="org" record={record} active disabled={false} beforeStart={async () => { saves++; if (options.hiddenDuringSave) Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); return { ...record, revision: 4 }; }} onMissingInputs={fields => { missing = fields; }} onBusyChange={value => { busy = value; }} onStatusChange={() => {}} captureFactory={() => createCaptureController(async () => sdk)} demoConsentEnabled={options.demoConsentEnabled ?? false}/>); await flush(); });
    await run({ releaseStatus: async () => { await act(async () => { releaseStatus(); await flush(); }); },
      setCurrent: async value => { current = value; await act(async () => { document.dispatchEvent(new dom.window.Event("visibilitychange")); await flush(); }); },
      requests, starts: () => starts, saved: () => saves, busy: () => busy, missing: () => missing,
      click: async text => { const button = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === text); if (!button) throw new Error(`Missing ${text}`); await act(async () => { button.click(); await flush(); }); },
      consent: async () => { await act(async () => { document.querySelector<HTMLInputElement>('input[type="radio"][value="standing"]:not(:disabled)')?.click(); document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); }); },
      finish: async () => { await act(async () => { finish({ raw_intensity: [{ r: 1, g: 2, b: 3 }, { r: 2, g: 3, b: 4 }], ppg_time: [0, 33], average_fps: 30 }); await flush(); }); },
      frame: async message => { await act(async () => { onFrame({ message, progress: 25, type: "scan", isLiteMode: false, isThrottling: false }); await flush(); }); },
    });
  } finally { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; } }
}
test("disabled feature never starts SDK or consumes a session", async () => harness(async ({ starts, requests }) => {
  expect(document.body.textContent).toContain("Face scan is not available yet");
  expect(starts()).toBe(0); expect(requests.every(r => r.body === null)).toBe(true);
}, { enabled: false }));
test("demo consent request unlocks the scan after two seconds without sending a message", async () => harness(async ({ click, requests, starts }) => {
  await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"][value="standing"]')!.click());
  const scan = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Start face scan")!;
  expect(scan.disabled).toBe(true);
  await click("Send consent request");
  expect(scan.disabled).toBe(true);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 2_050)); });
  expect(scan.disabled).toBe(false);
  expect(document.body.textContent).toContain("No patient was contacted.");
  expect(requests.every(request => request.body === null)).toBe(true);
  expect(starts()).toBe(0);
  await click("Clear consent selection");
  expect(scan.disabled).toBe(true);
}, { demoConsentEnabled: true }));
test("demo signed consent selection starts a scan without uploading the file", async () => harness(async ({ click, requests, starts }) => {
  await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"][value="resting"]')!.click());
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Choose signed consent file"]')!;
  const file = new window.File(["signed consent"], "consent.pdf", { type: "application/pdf" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new window.Event("change", { bubbles: true })));
  const scan = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Start face scan")!;
  expect(scan.disabled).toBe(false);
  expect(document.body.textContent).toContain("The file was not uploaded or stored.");
  expect(requests.every(request => request.body === null)).toBe(true);
  await click("Start face scan");
  expect(starts()).toBe(1);
  expect(requests.some(request => request.body?.posture === "resting")).toBe(true);
}, { demoConsentEnabled: true }));
test("missing scan weight directs correction without creating a remote session", async () => harness(async ({ consent, click, missing, requests, starts }) => {
  await consent(); await click("Start face scan");
  expect(missing()).toEqual(["weightKg"]);
  expect(requests.some(request => request.body?.requestKey)).toBe(false);
  expect(starts()).toBe(0);
}, { weight: null }));
test("saves draft before capture and unlocks navigation only after upload acceptance", async () => harness(async ({ consent, click, starts, saved, requests, finish, busy }) => {
  await consent(); await click("Start face scan");
  expect(saved()).toBe(1); expect(starts()).toBe(1); expect(busy()).toBe(true);
  const start = requests.find(r => r.body?.revision); expect(start?.body.revision).toBe(4); expect(start?.body.requestKey.length).toBeGreaterThan(16);
  await finish(); expect(busy()).toBe(false); expect(document.body.textContent).toContain("Your capture is saved");
}));
test("shows position and stillness guidance below the camera image", async () => harness(async ({ consent, click, frame }) => {
  await consent(); await click("Start face scan");
  const videoArea = document.querySelector('canvas[aria-label="Camera scan preview"]')?.parentElement;
  const preview = videoArea?.parentElement;
  const guidance = preview?.querySelector('[role="status"]');
  expect(videoArea?.contains(guidance ?? null)).toBe(false);
  expect(guidance?.textContent).toContain("Preparing camera");
  await frame("Please move a bit closer to the screen.");
  expect(preview?.querySelector('[role="status"]')?.textContent).toBe("Please move a bit closer to the screen.");
  await frame("25% Completed");
  expect(preview?.querySelector('[role="status"]')?.textContent).toBe("Hold still and keep your face in view.");
}));
test("lost upload response reconciles accepted scan without another capture", async () => harness(async ({ consent, click, finish, starts, requests }) => {
  await consent(); await click("Start face scan"); await finish();
  expect(starts()).toBe(1); expect(requests.filter(r => r.path.endsWith("/signal")).length).toBe(1);
  expect(document.body.textContent).toContain("Your capture is saved");
}, { lostUpload: true }));
test("reopens processing session without requesting camera", async () => harness(async ({ starts }) => {
  expect(document.body.textContent).toContain("Getting scan results"); expect(starts()).toBe(0);
}, { existing: { ...session, state: "PROCESSING" } }));

test("explains an expired attempt and retains earlier attempts in scan history", async () => harness(async ({ starts }) => {
  expect(document.body.textContent).toContain("No scan result");
  expect(document.body.textContent).toContain("ended before analysis");
  expect(document.querySelector('section[aria-label="Scan history"]')?.textContent).toContain("Scan failed");
  expect([...document.querySelectorAll("button")].some(button => button.textContent === "Start a new scan")).toBe(true);
  expect(starts()).toBe(0);
}, { existing: { ...session, state: "EXPIRED" }, history: [{ ...session, id: "earlier", state: "FAILED" }] }));

test("late pre-upload status cannot overwrite accepted upload", async () => harness(async ({ consent, click, finish, releaseStatus }) => {
  await consent(); await click("Start face scan"); await finish(); await releaseStatus();
  expect(document.body.textContent).toContain("Your capture is saved");
  expect(document.body.textContent).not.toContain("Resume capture");
}, { delayedStatus: true }));
test("queued cancellation targets the current attempt after a previous capture", async () => harness(async ({ consent, click, finish, setCurrent, requests }) => {
  await consent(); await click("Start face scan"); await finish();
  await setCurrent({ ...session, id: "another-attempt", state: "UPLOAD_ACCEPTED" });
  await click("Cancel scan");
  expect(requests.find(r => r.path.endsWith("/cancel"))?.path).toContain("/another-attempt/cancel");
}));
test("backgrounding during preparation never starts a camera", async () => harness(async ({ consent, click, starts, busy }) => {
  await consent(); await click("Start face scan");
  expect(starts()).toBe(0); expect(busy()).toBe(false);
  expect(document.body.textContent).toContain("Keep this page visible before starting the camera");
}, { hiddenDuringSave: true }));

test("lost start response restores the accepted attempt before camera retry", async () => harness(async ({ consent, click, starts, requests }) => {
  await consent(); await click("Start face scan");
  expect(starts()).toBe(0);
  expect(document.body.textContent).toContain("Resume capture");
  await click("Resume capture");
  expect(starts()).toBe(1);
  expect(requests.filter(r => r.body?.requestKey)).toHaveLength(1);
}, { lostStart: true }));

test("requires posture and sends the selected activity with scan creation", async () => harness(async ({ consent, click, requests }) => {
  expect([...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map(input => input.value)).toEqual(["resting", "standing"]);
  const start = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Start face scan")!;
  expect(start.disabled).toBe(true);
  await consent(); await click("Start face scan");
  expect(requests.find(r => r.body?.requestKey)?.body.posture).toBe("standing");
}));

test("uncertain provider outcome offers neither cancellation nor a duplicate scan", async () => harness(async ({ starts }) => {
  expect(document.body.textContent).toContain("Scan result unavailable");
  expect(document.body.textContent).toContain("contact support before trying another scan");
  expect([...document.querySelectorAll("button")].some(b => /Cancel scan|Start another scan|Resume capture/.test(b.textContent ?? ""))).toBe(false);
  expect(starts()).toBe(0);
}, {existing: {...session, state: "RECONCILIATION_REQUIRED"}}));

test("failed pre-submission attempt offers explicit retry without automatic capture", async () => harness(async ({consent, click, starts, requests}) => {
  expect(starts()).toBe(0);
  expect(requests.every(r => r.body === null)).toBe(true);
  expect([...document.querySelectorAll("button")].some(b => b.textContent === "Try again")).toBe(true);
  await consent(); await click("Try again");
  expect(starts()).toBe(1);
  expect(requests.filter(r => r.body?.requestKey).length).toBe(1);
}, {existing: {...session, state:"FAILED", failureCode:"SCAN_NOT_SUBMITTED"}}));

test("explicit service rejection shows failed status without permitting another submission", async () => harness(async ({starts}) => {
  expect(document.body.textContent).toContain("Scan failed");
  expect(document.body.textContent).toContain("The scan could not be processed");
  expect(document.body.textContent).not.toContain("Scan result unavailable");
  expect([...document.querySelectorAll("button")].some(b => /Try again|Start another scan/.test(b.textContent ?? ""))).toBe(false);
  expect(starts()).toBe(0);
}, {existing: {...session,state:"RECONCILIATION_REQUIRED",failureCode:"PROVIDER_REJECTED"}}));

test("confirmed device rejection offers explicit retry without automatic capture", async () => harness(async ({consent, click, starts, requests}) => {
  expect(starts()).toBe(0);
  expect(requests.every(r => r.body === null)).toBe(true);
  expect([...document.querySelectorAll("button")].some(b => b.textContent === "Try again")).toBe(true);
  await consent(); await click("Try again");
  expect(starts()).toBe(1);
  expect(requests.filter(r => r.body?.requestKey).length).toBe(1);
}, {existing: {...session, state:"FAILED", failureCode:"DEVICE_NOT_SUPPORTED"}}));


test("completed scan keeps rescan setup closed until explicitly requested", async () => harness(async ({ click, starts, requests }) => {
  expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  await click("Scan again");
  expect(document.body.textContent).toContain("Previous results stay saved");
  expect(document.querySelector('input[type="checkbox"]')).not.toBeNull();
  expect(starts()).toBe(0);
  expect(requests.every(request => request.body === null)).toBe(true);
  await click("Keep current results");
  expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  expect(document.body.textContent).toContain("Scan again");
}, { existing: { ...session, state: "COMPLETED" } }));


test("retained scan stays visible without requiring another capture", async () => harness(async ({ starts, requests }) => {
  expect(document.body.textContent).toContain("The saved face scan is retained");
  expect(document.body.textContent).not.toContain("The saved scan used different");
  expect(document.body.textContent).toContain("Scan again");
  expect(document.body.textContent).not.toContain("Start face scan");
  expect(starts()).toBe(0);
  expect(requests.every(request => request.body === null)).toBe(true);
}, { existing: { ...session, state: "COMPLETED" } }));

test("changed weight flags the retained scan without replacing it", async () => harness(async ({ starts }) => {
  expect(document.body.textContent).toContain("The saved scan used different weight.");
  expect(document.body.textContent).toContain("Scan again");
  expect(starts()).toBe(0);
}, { existing: { ...session, state: "COMPLETED" }, weight: 75 }));
