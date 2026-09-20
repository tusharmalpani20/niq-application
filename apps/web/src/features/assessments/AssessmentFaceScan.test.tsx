import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { AssessmentWorkflow, FaceScanList, FaceScanSession } from "@niq/application-contracts";
import { AssessmentFaceScan } from "./AssessmentFaceScan";
import { createCaptureController, type CaptureSDK } from "./careplix-capture";

const session: FaceScanSession = { id: "session", state: "REQUESTED", context: { dob: "1990-01-01", gender: "female", heightCm: 170, weightKg: 70, posture: "resting", employeeId: "employee" }, createdAt: "2026-09-20T12:00:00.000Z", updatedAt: "2026-09-20T12:00:00.000Z", completedAt: null, failureCode: null, result: null, score: null };
async function harness(run: (ctx: { click: (text: string) => Promise<void>; consent: () => Promise<void>; finish: () => Promise<void>; requests: Array<{ path: string; body: any }>; starts: () => number; saved: () => number; busy: () => boolean }) => Promise<void>, options: { enabled?: boolean; existing?: FaceScanSession; lostUpload?: boolean } = {}) {
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", { url: "https://niq.test" });
  const keys = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "NodeFilter", "DocumentFragment", "HTMLButtonElement", "HTMLInputElement", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT", "fetch"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values: Record<string, unknown> = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, DocumentFragment: dom.window.DocumentFragment, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true };
  Object.defineProperty(dom.window.navigator, "mediaDevices", { value: { getUserMedia: () => { throw new Error("Real camera must not be used in this test"); } } });
  const requests: Array<{ path: string; body: any }> = [];
  let current = options.existing ?? null, starts = 0, saves = 0, busy = false;
  let finish: Parameters<CaptureSDK["facescan"]["onScanFinish"]>[0] = () => {};
  const sdk: CaptureSDK = { facescan: { onFrame: () => {}, onError: () => {}, onScanFinish: fn => { finish = fn; }, startScan: async () => { starts++; }, stopScan: () => {} } };
  values.fetch = async (input: string, init?: RequestInit) => {
    const path = String(input), body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ path, body });
    if (path.endsWith("/signal")) { current = { ...session, state: "UPLOAD_ACCEPTED" }; if (options.lostUpload) throw new Error("connection lost"); return Response.json(current); }
    if (path.endsWith("/cancel")) { current = { ...session, state: "CANCELLED" }; return Response.json(current); }
    if (init?.method === "POST") { current = session; return Response.json(current); }
    const list: FaceScanList = { enabled: options.enabled ?? true, currentSessionId: current?.id ?? null, sessions: current ? [current] : [] };
    return Response.json(list);
  };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  const root = createRoot(document.getElementById("root")!);
  const record = { id: "assessment", revision: 3, status: "DRAFT" } as AssessmentWorkflow;
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    await act(async () => { root.render(<AssessmentFaceScan organizationId="org" record={record} active disabled={false} beforeStart={async () => { saves++; return { ...record, revision: 4 }; }} onBusyChange={value => { busy = value; }} onStatusChange={() => {}} captureFactory={() => createCaptureController(async () => sdk)}/>); await flush(); });
    await run({ requests, starts: () => starts, saved: () => saves, busy: () => busy,
      click: async text => { const button = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === text); if (!button) throw new Error(`Missing ${text}`); await act(async () => { button.click(); await flush(); }); },
      consent: async () => { await act(async () => { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); }); },
      finish: async () => { await act(async () => { finish({ raw_intensity: [{ r: 1, g: 2, b: 3 }, { r: 2, g: 3, b: 4 }], ppg_time: [0, 33], average_fps: 30 }); await flush(); }); },
    });
  } finally { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; } }
}
test("disabled feature never starts SDK or consumes a session", async () => harness(async ({ starts, requests }) => {
  expect(document.body.textContent).toContain("Face scan is not available yet");
  expect(starts()).toBe(0); expect(requests.every(r => r.body === null)).toBe(true);
}, { enabled: false }));
test("saves draft before capture and unlocks navigation only after upload acceptance", async () => harness(async ({ consent, click, starts, saved, requests, finish, busy }) => {
  await consent(); await click("Start face scan");
  expect(saved()).toBe(1); expect(starts()).toBe(1); expect(busy()).toBe(true);
  const start = requests.find(r => r.body?.revision); expect(start?.body.revision).toBe(4); expect(start?.body.requestKey.length).toBeGreaterThan(16);
  await finish(); expect(busy()).toBe(false); expect(document.body.textContent).toContain("Your scan has been uploaded");
}));
test("lost upload response reconciles accepted scan without another capture", async () => harness(async ({ consent, click, finish, starts, requests }) => {
  await consent(); await click("Start face scan"); await finish();
  expect(starts()).toBe(1); expect(requests.filter(r => r.path.endsWith("/signal")).length).toBe(1);
  expect(document.body.textContent).toContain("Your scan has been uploaded");
}, { lostUpload: true }));
test("reopens processing session without requesting camera", async () => harness(async ({ starts }) => {
  expect(document.body.textContent).toContain("Scan processing"); expect(starts()).toBe(0);
}, { existing: { ...session, state: "PROCESSING" } }));
